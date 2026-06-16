FROM node:20-alpine

# Instala dependências do sistema
RUN apk add --no-cache \
    docker-cli \
    bash \
    curl \
    sudo \
    shadow

# Instala Containerlab dentro da imagem do backend para nao depender do host.
RUN bash -c "$(curl -sL https://get.containerlab.dev)"

WORKDIR /app

# Copia e instala dependências Node
COPY package*.json ./
RUN npm ci --only=production

# Copia código
COPY . .

# Cria diretório de labs
RUN mkdir -p /opt/bgp-labs

EXPOSE 3000

# Executa como root para poder invocar docker e containerlab
USER root

CMD ["node", "server.js"]
