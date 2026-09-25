"""Local audio transcription. Audio stays on this computer."""
import io
import threading
from pathlib import Path

MODEL_DIR = Path(__file__).with_name('models') / 'small'
LOCK = threading.Lock()
MODEL = None
MAX_BYTES = 25 * 1024 * 1024
EXTENSIONS = {'.wav', '.mp3', '.m4a', '.mp4', '.aac', '.ogg', '.flac', '.webm'}


def transcribe_audio(raw, filename):
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError('请选择不超过25 MB的音频')
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
            raise RuntimeError('请使用 .venv/bin/python server.py 启动，语音依赖装在项目虚拟环境里') from None
        samples = []
        count = 0
        try:
            with av.open(io.BytesIO(raw)) as container:
                if not container.streams.audio:
                    raise ValueError('文件中没有音轨')
                resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
                for frame in container.decode(audio=0):
                    for out in resampler.resample(frame):
                        count += out.samples
                        if count > 16000 * 600:
                            raise ValueError('本地演示版每段最多10分钟，请先拆分音频')
                        samples.append(out.to_ndarray().flatten())
                for out in resampler.resample(None):
                    count += out.samples
                    samples.append(out.to_ndarray().flatten())
            if not samples or count > 16000 * 600:
                raise ValueError('音频为空或超过10分钟')
        except ValueError:
            raise
        except Exception:
            raise ValueError('无法读取音频，请检查文件是否损坏或换成 WAV / MP3') from None
        if not (MODEL_DIR / 'model.bin').exists():
            raise RuntimeError('本地语音模型未安装，请运行 .venv/bin/python setup_audio.py')
        global MODEL
        try:
            if MODEL is None:
                MODEL = WhisperModel(str(MODEL_DIR), device='cpu', compute_type='int8', cpu_threads=4)
            segments, info = MODEL.transcribe(np.concatenate(samples).astype(np.float32) / 32768.0,
                                              vad_filter=True, beam_size=3, condition_on_previous_text=False)
            rows = [{'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip()} for s in segments if s.text.strip()]
        except Exception:
            raise RuntimeError('本地转写失败，请用较短音频重试并检查模型安装') from None
        return {'text': '\n'.join(s['text'] for s in rows), 'segments': rows, 'language': info.language,
                'duration': round(count / 16000, 2)}
    finally:
        LOCK.release()
