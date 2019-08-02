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
  appId: 'wx8372b24417f593f2',
  secret: 'd649471dad4e9530c2ed7068089d9a82',
});

setTimeout(() => {
  expressMiddle(req, res);
}, 5000);

setTimeout(() => {
  expressMiddle(req, res);
  expressMiddle(req, res);
  expressMiddle(req, res);
}, 7000);
