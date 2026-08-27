FROM python:3.12-slim

# Sortie non bufferisee des le depart (evite le probleme de logs invisibles
# rencontre avec Pokeum le 27/08 -> plus besoin de bidouiller le CMD pour ca).
ENV PYTHONUNBUFFERED=1

# Librairies systeme necessaires a OpenCV, meme en version headless (meme
# souci rencontre avec Pokeum -> meme correctif applique directement ici).
# curl ajoute pour faciliter les tests manuels via la Console Railway.
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pas de sync ni d'index build ici (contrairement a Pokeum) : le service
# n'a pas de base a synchroniser, il analyse une photo a la demande. Les
# modeles PaddleOCR se telechargent au premier demarrage
