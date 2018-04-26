var jssdk = require('../index');


var expressmddile = jssdk({
    appId: 'your app id',                         // 公众号appId，
    secret: 'your secret'           // 公众号secret，
});

var req = {
  query: {
    url: 'http://snk.1pix.cn/index.html'
  }
}

var res = {
  json: ret => {
    console.log(ret);
  }
}

// expressmddile(req, res);


expressmddile = jssdk({
  appId: 'your app id',
  secret: 'your secret',
  type: 'redis',
  redisHost: '192.168.1.7',
  redisPort: 6379
});

setTimeout(() => {
  expressmddile(req, res);
}, 5000);