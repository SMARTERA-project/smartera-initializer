FROM alpine:latest

RUN apk add --no-cache curl

COPY NAMA_10R_3NLP.sh /script.sh
RUN chmod +x /script.sh

CMD ["/script.sh"]