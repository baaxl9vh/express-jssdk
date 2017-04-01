# express-jssdk
微信JSSDK接口权限注入配置 Express 中间件
wechat jssdk signature for express middleware


## Usage

```javascript

var express = require('express')
var jssdk = require('express-jssdk')
var app = express()

app.get('/jsssdk', jssdk({
  appId: 'wxe8524f4abcd8c270',
  secret: '8d63747f264446a3b21abcd100e64039'
}))

app.listen(80, function () {})

```
