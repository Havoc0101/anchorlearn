"""Local audio transcription. Audio stays on this computer."""
import io
import tempfile
import threading
import importlib.util
from pathlib import Path

MODEL_DIR = Path(__file__).with_name('models') / 'small'
LOCK = threading.Lock()
MODEL = None
MAX_BYTES = 8 * 1024 * 1024 * 1024
MAX_SECONDS = 3 * 60 * 60
EXTENSIONS = {'.wav', '.mp3', '.m4a', '.mp4', '.aac', '.ogg', '.flac', '.webm'}


def audio_status():
    missing = [name for name in ('av', 'numpy', 'faster_whisper') if importlib.util.find_spec(name) is None]
    model_ready = all((MODEL_DIR / name).is_file() for name in ('model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'))
    return {'ready': not missing and model_ready, 'dependencies_ready': not missing,
            'model_ready': model_ready, 'max_bytes': MAX_BYTES, 'max_seconds': MAX_SECONDS}


def copy_upload(source, destination, size):
    if not 0 < size <= MAX_BYTES:
        raise ValueError('音频大小需在1字节到8 GB之间')
    remaining = size
    while remaining:
        block = source.read(min(1024 * 1024, remaining))
        if not block:
            raise ValueError('上传未完成，请重新选择文件')
        destination.write(block)
        remaining -= len(block)
    destination.seek(0)


def transcribe_audio(raw, filename):
    if isinstance(raw, bytes):
        if not raw or len(raw) > MAX_BYTES:
            raise ValueError('请选择不超过8 GB的音频')
        raw = io.BytesIO(raw)
    if Path(filename.lower()).suffix not in EXTENSIONS:
        raise ValueError('不支持此格式，请使用 WAV、MP3、M4A、MP4、AAC、OGG、FLAC 或 WebM')
    # ponytail: one local transcription at a time; add job queue only for multi-user use.
    if not LOCK.acquire(blocking=False):
        raise RuntimeError('已有音频正在转写，请完成后再试')
    try:
        try:
            import av
            import numpy as np
            from faster_whisper import WhisperModel
        except ImportError:
            raise RuntimeError('本机转写依赖尚未准备好，请先完成安装并用项目 .venv 启动服务。') from None
        # Decode to a temporary PCM file, keeping memory bounded for long recordings.
        pcm = tempfile.TemporaryFile()
        count = 0
        try:
            with av.open(raw) as container:
                if not container.streams.audio:
                    raise ValueError('文件中没有音轨')
                resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
                def save(frame):
                    nonlocal count
                    count += frame.samples
                    if count > 16000 * MAX_SECONDS:
                        raise ValueError('每段最多3小时，请拆分后再上传')
                    pcm.write(frame.to_ndarray().flatten().tobytes())
                for frame in container.decode(audio=0):
                    for out in resampler.resample(frame):
                        save(out)
                for out in resampler.resample(None):
                    save(out)
            if not count:
                raise ValueError('音频为空')
            pcm.seek(0)
        except Exception as exc:
            pcm.close()
            if isinstance(exc, ValueError):
                raise
            raise ValueError('无法读取音频，请检查文件格式') from None
        if not (MODEL_DIR / 'model.bin').exists():
            pcm.close()
            raise RuntimeError('本地语音模型尚未准备好，请先下载本项目的 small 语音模型。')
        global MODEL
        try:
            if MODEL is None:
                MODEL = WhisperModel(str(MODEL_DIR), device='cpu', compute_type='int8', cpu_threads=4)
            rows = []
            language = None
            offset = 0
            # ponytail: fixed 30-minute chunks bound memory; add overlapping alignment if boundary accuracy requires it.
            while block := pcm.read(16000 * 1800 * 2):
                samples = np.frombuffer(block, dtype=np.int16).astype(np.float32) / 32768.0
                segments, info = MODEL.transcribe(samples, vad_filter=True, beam_size=3, condition_on_previous_text=False)
                language = language or info.language
                rows.extend({'start': round(offset + s.start, 2), 'end': round(offset + s.end, 2), 'text': s.text.strip()} for s in segments if s.text.strip())
                offset += len(samples) / 16000
        except Exception:
            raise RuntimeError('本地转写失败，请用较短音频重试并检查模型安装') from None
        finally:
            pcm.close()
        return {'text': '\n'.join(s['text'] for s in rows), 'segments': rows, 'language': language,
                'duration': round(count / 16000, 2)}
    finally:
        LOCK.release()
