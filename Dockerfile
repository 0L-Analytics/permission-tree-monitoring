FROM node:16-alpine
WORKDIR /code
COPY . .

RUN chmod 755 /code/startCmd
RUN chmod 755 /code/scrapeLoop

RUN yarn

CMD [ "/code/startCmd" ]