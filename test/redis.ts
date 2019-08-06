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

const redisMiddle = jssdk({
  appId: 'your app id',
  secret: 'your secret',
  type: 'redis',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  debug: true,
});

redisMiddle(req, res);

const noRedisMiddle = jssdk({
  appId: 'your app id',
  secret: 'your secret',
  type: 'redis',
  debug: true,
});

noRedisMiddle(req, res);
