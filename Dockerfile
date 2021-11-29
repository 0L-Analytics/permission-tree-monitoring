FROM node:16-alpine
WORKDIR /code
COPY . .

RUN chmod 755 /code/startCmd

COPY scrape.cron /etc/periodic/hourly/scrape
RUN chmod 755 /etc/periodic/hourly/scrape

RUN yarn

CMD [ "/code/startCmd" ]