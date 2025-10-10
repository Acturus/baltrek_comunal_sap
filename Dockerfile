# Usa la imagen base de Ubuntu 18.04 LTS (Bionic Beaver)
FROM ubuntu:18.04

# Variables de entorno (Solo TINI, ya no Python/Pyenv)
ENV TINI_VERSION=v0.19.0
ENV DEBIAN_FRONTEND=noninteractive

# 1. INSTALACIÓN DE HERRAMIENTAS CRÍTICAS Y DEPENDENCIAS
# Incluimos: build-essential (para compilar NodeSource), curl, netcat, nano, y wget.
RUN apt-get update && apt-get install -y \
    curl \
    netcat \
    build-essential \
    wget \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*

# 2. INSTALAR NODE.JS 20 (Usando NodeSource PPA)
# Este es el método oficial y estable para instalar Node.js 20 en Ubuntu 18.04.
# a) Descargar e instalar la clave y el repositorio de NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    # b) Instalar Node.js y npm
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# 3. INSTALAR TINI (Descarga de GitHub)
# Instalación manual para evitar problemas de repositorio.
RUN wget -q -O /usr/local/bin/tini https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini && \
    chmod +x /usr/local/bin/tini

# 4. CONFIGURACIÓN FINAL DEL ENTORNO
# Crear carpeta de scripts y configurar el directorio de trabajo
RUN mkdir /scripts
WORKDIR /scripts
RUN npm install

# 5. CONFIGURACIÓN DE INICIO
# Tini es el ENTRYPOINT.
ENTRYPOINT ["/usr/local/bin/tini", "--"]
CMD ["tail", "-f", "/dev/null"]