"""Confirmed tasks only; SQLite transaction makes retries atomic."""
import datetime as dt
import json
import re
import sqlite3
import uuid
from pathlib import Path

DB_PATH = Path(__file__).with_name('tasks.db')


class Conflict(ValueError):
    pass


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS confirmations (request_id TEXT PRIMARY KEY, payload TEXT NOT NULL, response TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS draft_tasks (review_id TEXT, client_task_id TEXT, task_id TEXT NOT NULL, PRIMARY KEY (review_id, client_task_id))')
    db.commit()
    return db


def validate(data):
    if not isinstance(data, dict) or data.get('confirmed') is not True:
        raise ValueError('需要用户确认：confirmed 必须为 true')
    request_id = data.get('request_id')
    if not isinstance(request_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', request_id):
        raise ValueError('request_id 需为8至128位字母、数字、下划线或连字符')
    items = data.get('tasks')
    if not isinstance(items, list) or not 1 <= len(items) <= 3:
        raise ValueError('一次确认需包含1至3条任务')
    review_id = data.get('review_id')
    extended = review_id is not None
    if extended and (not isinstance(review_id, str) or not review_id.strip() or len(review_id) > 128):
        raise ValueError('review_id 需为1至128字的草稿编号')
    recording_id = data.get('recording_id')
    if recording_id is not None and (not isinstance(recording_id, str) or not recording_id.strip() or len(recording_id) > 128):
        raise ValueError('recording_id 应为录音编号或 null')
    clean = []
    clients = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('任务必须是对象')
        task = {}
        for field, limit in [('title', 200), ('first_step', 1000), ('source_quote', 12000)]:
            value = item.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > limit:
                raise ValueError(f'{field} 不能为空，且不能超过{limit}字')
            task[field] = value
        date = item.get('due_date')
        if date is not None:
            if not isinstance(date, str):
                raise ValueError('due_date 应为 YYYY-MM-DD 或 null')
            try:
                if dt.date.fromisoformat(date).isoformat() != date:
                    raise ValueError()
            except ValueError:
                raise ValueError('due_date 应为有效的 YYYY-MM-DD 或 null')
        task['due_date'] = date
        if extended:
            client_id = item.get('client_task_id')
            if not isinstance(client_id, str) or not client_id.strip() or len(client_id) > 256 or client_id in clients:
                raise ValueError('client_task_id 不能为空、过长或重复')
            clients.add(client_id)
            requirements = item.get('requirements')
            if not isinstance(requirements, str) or len(requirements) > 4000:
                raise ValueError('requirements 应为不超过4000字的文字，可为空')
            if item.get('source_kind') not in ('transcript', 'user-context'):
                raise ValueError('source_kind 应为 transcript 或 user-context')
            task.update(client_task_id=client_id, requirements=requirements,
                        source_kind=item['source_kind'], review_id=review_id, recording_id=recording_id)
        elif any(key in item for key in ('client_task_id', 'requirements', 'source_kind')):
            raise ValueError('包含核对页字段时必须提供 review_id，避免静默丢失信息')
        clean.append(task)
    return request_id, clean


def confirm_tasks(data):
    request_id, items = validate(data)
    payload = json.dumps(items, ensure_ascii=False, sort_keys=True)
    db = connect()
    try:
        with db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT payload, response FROM confirmations WHERE request_id=?', (request_id,)).fetchone()
            if old:
                if old[0] != payload:
                    raise Conflict('同一 request_id 已用于不同内容，请恢复原请求或使用新的编号')
                return json.loads(old[1])
            now = dt.datetime.now(dt.timezone.utc).isoformat()
            tasks = []
            for item in items:
                old_task = None
                if 'review_id' in item:
                    row = db.execute('SELECT t.data FROM draft_tasks d JOIN tasks t ON t.id=d.task_id WHERE d.review_id=? AND d.client_task_id=?',
                                     (item['review_id'], item['client_task_id'])).fetchone()
                    old_task = json.loads(row[0]) if row else None
                if old_task:
                    if any(old_task.get(key) != value for key, value in item.items()):
                        raise Conflict('这个草稿任务已保存，不能通过再次确认覆盖；修改接口尚未提供')
                    tasks.append(old_task)
                    continue
                task = dict(item, id=str(uuid.uuid4()), status='pending', created_at=now)
                db.execute('INSERT INTO tasks VALUES (?, ?)', (task['id'], json.dumps(task, ensure_ascii=False)))
                if 'review_id' in item:
                    db.execute('INSERT INTO draft_tasks VALUES (?, ?, ?)', (item['review_id'], item['client_task_id'], task['id']))
                tasks.append(task)
            result = {'request_id': request_id, 'tasks': tasks}
            db.execute('INSERT INTO confirmations VALUES (?, ?, ?)', (request_id, payload, json.dumps(result, ensure_ascii=False)))
            return result
    finally:
        db.close()


def list_tasks():
    db = connect()
    try:
        return {'tasks': [json.loads(row[0]) for row in db.execute('SELECT data FROM tasks ORDER BY rowid')]}
    finally:
        db.close()
