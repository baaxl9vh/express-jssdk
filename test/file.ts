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

const fileMiddle = jssdk({
  appId: 'your app id',
  secret: 'your secret',
  type: 'file',
  tokenFilename: __dirname + '/local-token.json',
  ticketFilename: __dirname + '/local-ticket.json',
});

fileMiddle(req, res);

const noFileMiddle = jssdk({
  appId: 'your app id',
  secret: 'your secret',
  type: 'file',
});

noFileMiddle(req, res);
