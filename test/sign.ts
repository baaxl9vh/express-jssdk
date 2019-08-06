import jssdk from '../jssdk';

const req = {
  query: {
    url: 'http://yourdomain.com/index.html',
  },
  body: {},
};

const res = {
  json: (ret: object) => {
    console.log(ret);
  },
};

const expressMiddle = jssdk({
  appId: 'your app id',
  secret: 'your secret',
  type: 'file',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  tokenFilename: __dirname + '/local-token.json',
  ticketFilename: __dirname + '/local-ticket.json',
  debug: true,
});

setTimeout(() => {
  expressMiddle(req, res);
}, 5000);

setTimeout(() => {
  expressMiddle(req, res);
  expressMiddle(req, res);
  expressMiddle(req, res);
}, 7000);
