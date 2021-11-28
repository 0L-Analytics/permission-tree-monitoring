FROM node:16-alpine
WORKDIR /code
COPY . .

COPY scrape.cron /etc/cron.hourly/scrape
RUN chmod 755 /etc/cron.hourly/scrape

RUN yarn

CMD [ "yarn", "ts-node", "index.ts" ]