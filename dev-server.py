"""Локальный сервер для папки web/ без кэша браузера.

Обычный `python3 -m http.server` разрешает браузеру держать скрипты в кэше, и после правок
страница может получить свежий HTML со старым JS — кабинет тогда открывается пустым.
Здесь каждый ответ помечен no-store, поэтому браузер всегда берёт файлы заново.

Запуск: python3 dev-server.py [порт]   (по умолчанию 8765, только для этого компьютера)
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent / 'web'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # Без заголовков условных запросов сервер не отвечает 304 и всегда отдаёт файл целиком
    def send_head(self):
        for header in ('If-Modified-Since', 'If-None-Match'):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler) as server:
        print(f'Сайт: http://127.0.0.1:{PORT}  (папка {ROOT}, без кэша, Ctrl+C — остановить)')
        server.serve_forever()
