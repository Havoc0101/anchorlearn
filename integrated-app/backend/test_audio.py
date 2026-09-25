import io
import unittest
import wave
from unittest.mock import patch
from types import SimpleNamespace
import transcribe


class AudioCheck(unittest.TestCase):
    def test_audio_decode_and_guards(self):
        for raw, name in [(b'', 'a.wav'), (b'bad', 'a.txt'), (b'bad', 'a.wav')]:
            with self.assertRaises(ValueError):
                transcribe.transcribe_audio(raw, name)
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(16000)
            f.writeframes(b'\x00\x00' * 16000)
        with patch.object(transcribe.MODEL_DIR.__class__, 'exists', return_value=True), patch.object(transcribe, 'MODEL') as model:
            model.transcribe.return_value = (iter([]), SimpleNamespace(language='zh'))
            result = transcribe.transcribe_audio(buf.getvalue(), 'sample.wav')
            self.assertEqual(result['text'], '')
            self.assertEqual(result['duration'], 1.0)
        self.assertFalse(transcribe.LOCK.locked())


if __name__ == '__main__':
    unittest.main()
