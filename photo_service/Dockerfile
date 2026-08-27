FROM python:3.12-slim

# Sortie non bufferisee des le depart (evite le probleme de logs invisibles
# rencontre avec Pokeum le 27/08 -> plus besoin de bidouiller le CMD pour ca).
ENV PYTHONUNBUFFERED=1

# Librairies systeme necessaires a OpenCV, meme en version headless (meme
# souci rencontre avec Pokeum -> meme correctif applique directement ici).
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pas de sync ni d'index build ici (contrairement a Pokeum) : le service
# n'a pas de base a synchroniser, il analyse une photo a la demande. Les
# modeles PaddleOCR se telechargent au premier demarrage (quelques dizaines
# de Mo, largement plus rapide que le sync TCGdex de Pokeum).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
