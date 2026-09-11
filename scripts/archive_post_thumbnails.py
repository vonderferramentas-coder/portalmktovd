# Baixa a miniatura de cada post e guarda uma cópia permanente em
# data/social-posts-thumbnails/<id>.<ext>, reescrevendo thumbnailUrl para esse caminho
# local. A Meta assina e expira a URL de imagem depois de um tempo — guardar só o link (como
# era feito para o histórico reconstruído) deixa a miniatura quebrada mais pra frente sem
# re-coleta. Guardando a imagem em vez do link, o problema não existe mais.
#
# Usado por sync-meta-posts.yml (os ~30 posts recentes já vêm com thumbnail_url/media_url no
# próprio /media) e reconstruir-historico-posts.yml (que passa `refetch` para buscar um link
# avulso na Meta para o histórico antigo que ainda não tem nenhum).
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

THUMBS_DIR = Path('data/social-posts-thumbnails')
LOCAL_PREFIX = 'data/social-posts-thumbnails/'

IMAGE_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}

# A Meta devolve a imagem em resolução quase cheia (a maior coluna do painel, o modal de
# prévia, usa só 340px de largura em CSS — 680px cobre até tela retina 2x com folga).
# Reencodar pra JPEG nesse tamanho leva o arquivo de ~300KB pra dezenas de KB sem perda
# visível num card pequeno.
MAX_WIDTH = 720
JPEG_QUALITY = 82


def _existing_files():
    if not THUMBS_DIR.exists():
        return {}
    return {path.stem: path for path in THUMBS_DIR.iterdir() if path.is_file()}


def _resize_to_jpeg(raw_bytes):
    with Image.open(BytesIO(raw_bytes)) as img:
        img = img.convert('RGB')
        if img.width > MAX_WIDTH:
            height = round(img.height * MAX_WIDTH / img.width)
            img = img.resize((MAX_WIDTH, height), Image.LANCZOS)
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=JPEG_QUALITY, optimize=True)
        return buffer.getvalue()


def _download_image(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        content_type = (resp.headers.get('Content-Type') or '').split(';')[0].strip()
        if content_type not in IMAGE_CONTENT_TYPES:
            return None  # não é imagem (ex.: media_url de vídeo quando falta thumbnail_url)
        raw = resp.read()
    return _resize_to_jpeg(raw), '.jpg'


def archive_thumbnails(posts, refetch=None):
    """Garante uma cópia local da miniatura de cada post e reescreve post['thumbnailUrl']
    para o caminho local. `refetch(media_id)` só é chamado quando o post não tem
    thumbnailUrl nenhum (histórico antigo) — busca um link assinado fresco na Meta antes de
    baixar. Nunca derruba a coleta: falha em um post só pula pro próximo."""
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    existing_files = _existing_files()
    archived = failed = 0
    for post in posts:
        media_id = post['id']
        existing = existing_files.get(media_id)
        if existing:
            post['thumbnailUrl'] = LOCAL_PREFIX + existing.name
            continue
        url = post.get('thumbnailUrl')
        if url and url.startswith(LOCAL_PREFIX):
            continue  # já era local mas o arquivo sumiu — nada a fazer sem re-coleta
        if not url and refetch:
            try:
                url = refetch(media_id)
            except Exception:
                url = None
            time.sleep(0.2)
        if not url or not url.startswith('http'):
            continue
        try:
            result = _download_image(url)
        except Exception:
            # Cobre falha de rede e imagem corrompida/formato que o Pillow não abre — um post
            # ruim não pode travar a coleta dos outros milhares.
            result = None
        if not result:
            failed += 1
            continue
        data, ext = result
        filename = f'{media_id}{ext}'
        (THUMBS_DIR / filename).write_bytes(data)
        existing_files[media_id] = THUMBS_DIR / filename
        post['thumbnailUrl'] = LOCAL_PREFIX + filename
        archived += 1
        time.sleep(0.2)
    print(f'Miniaturas: {archived} baixadas agora, {failed} sem imagem disponível.')
    return archived
