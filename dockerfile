FROM node:latest

# Create app directory

WORKDIR /usr/src/app

# Install app dependencies

COPY package*.json ./

RUN npm ci

# Bundle app source

COPY . .

CMD [ "node", "index.js" ]