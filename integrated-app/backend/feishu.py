"""Read an explicitly shared Feishu docx; credentials stay in process memory."""
import json
import os
import re
from urllib import request, error
from urllib.parse import urlsplit

APP_ID = os.environ.get('FEISHU_APP_ID', '')
APP_SECRET = os.environ.get('FEISHU_APP_SECRET', '')

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def document_id(url):
    if not isinstance(url, str) or len(url) > 2048:
        raise ValueError('请输入飞书新版文档链接')
    parts = urlsplit(url)
    if (parts.scheme != 'https' or not parts.hostname or
        not parts.hostname.endswith('.feishu.cn') or parts.username or parts.password or
        parts.port not in (None, 443)):
        raise ValueError('仅支持 https://组织.feishu.cn/docx/文档编号 链接')
    match = re.fullmatch(r'/docx/([A-Za-z0-9]+)', parts.path)
    if not match:
        raise ValueError('请使用新版文档 docx 链接；妙记请先导出为文档')
    return match[1]

def call(path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = request.Request('https://open.feishu.cn/open-apis/' + path,
                          data=json.dumps(body).encode() if body is not None else None,
                          headers=headers)
    try:
        with request.build_opener(NoRedirect).open(req, timeout=30) as response:
            raw = response.read(2000001)
        if len(raw) > 2000000:
            raise RuntimeError('文档过大，请分段导入')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError()
        if result.get('code') != 0:
            raise RuntimeError('飞书读取失败，请核对应用凭证、已开通权限及文档应用的阅读授权')
        return result
    except (error.URLError, TimeoutError):
        raise RuntimeError('无法读取飞书，请检查网络、应用凭证和文档阅读授权') from None
    except (ValueError, UnicodeError):
        raise RuntimeError('飞书返回内容无法解析，请重试') from None

def import_document(url):
    doc_id = document_id(url)
    if not APP_ID or not APP_SECRET:
        raise RuntimeError('未配置飞书凭证，请使用 --ask-feishu 重启后端')
    auth = call('auth/v3/tenant_access_token/internal', {'app_id': APP_ID, 'app_secret': APP_SECRET})
    token = auth.get('tenant_access_token')
    if not isinstance(token, str) or not token:
        raise RuntimeError('飞书未返回有效授权')
    result = call('docx/v1/documents/' + doc_id + '/raw_content', token=token)
    data = result.get('data')
    text = data.get('content') if isinstance(data, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise RuntimeError('文档没有可导入的正文')
    if len(text) > 12000:
        raise RuntimeError('文档超过当前 12000 字分析上限，请将正文分段粘贴；本次未截断或导入')
    return {'text': text, 'source_url': url, 'document_id': doc_id}
