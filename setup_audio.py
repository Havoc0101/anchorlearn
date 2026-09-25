import os
from pathlib import Path
os.environ.setdefault('HF_HOME', str(Path(__file__).with_name('models') / '.cache'))
from faster_whisper.utils import download_model
from transcribe import MODEL_DIR

if __name__ == '__main__':
    print('下载 small 多语言转写模型（约500 MB），只需一次。', flush=True)
    download_model('small', output_dir=str(MODEL_DIR))
    print('模型已准备好。请运行 .venv/bin/python server.py')
