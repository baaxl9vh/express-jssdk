# express-jssdk

微信JSSDK接口权限注入配置 Express 中间件

wechat jssdk signature for express middleware

## Installation

```bash
npm install --save express-jssdk
```

## Usage

### Server Side

```javascript

var express = require('express')
var jssdk = require('express-jssdk')
var app = express()

app.get('/jssdk', jssdk({
  appId: 'your app id',                         // 公众号appId，
  secret: 'your secret'                         // 公众号secret，
}))

app.listen(80, function () {})

```

### Client Side

```javascript
var url = window.location.protocol + '//yourdomain.com/index.html';
var title = 'Test Share';
var desc = 'Test Desc';
var icon = window.location.protocol + '//yourdomain.com/icon.jpg';
$.ajax({
    url: '//yourdomain.com/api/jssdk/',
    dataType: 'json',
    type: 'GET',
    data: {url: window.location.href},          // 这里一定要用window.location.href，不然会二次分享无自定义分享，签名的url一定要与当前页面一致，包括query参数，二次分享会自动加上参数
    success: function (data) {
        wx.config({
            appId: data.appId,
            timestamp: data.timestamp,
            nonceStr: data.nonceStr,
            signature: data.signature,
            jsApiList: [
                'checkJsApi',
                'updateAppMessageShareData',    // 1.4版本
                'updateTimelineShareData',      // 1.4版本
                'onMenuShareTimeline',
                'onMenuShareAppMessage',
                'hideMenuItems'
            ]
        });
        wx.ready(function () {
            wx.hideMenuItems({
                menuList: [
                    'menuItem:share:weiboApp',
                    'menuItem:share:email'
                ],
                success: function (res) {
                },
                fail: function (res) {
                }
            });
            wx.updateAppMessageShareData({
                title: title,
                desc: desc,
                link: url,
                imgUrl: icon,
                success: function () {
                    console.log('updateAppMessageShareData success');
                }
            });
            wx.updateTimelineShareData({
                title: desc,
                link: url,
                imgUrl: icon,
                success: function () {
                    console.log('updateTimelineShareData success');
                }
            });
            wx.onMenuShareAppMessage({
                link: url,
                title: title,
                desc: desc,
                imgUrl: icon,
                success: function (res) {
                    console.log('share to friend success');
                }
            });
            wx.onMenuShareTimeline({
                link: url,
                title: desc,
                desc: desc,
                imgUrl: icon,
                success: function (res) {
                    console.log('share to timeline success');
                }
            });
        });
    },
    error: function (err) {
        console.log(err);
    }
});
```

## Configure JSSDK

```javascript
{
  appId: 'your app id',                                // 公众号appId，
  secret: 'your secret',                               // 公众号secret，
  corp: false,                                         // 是否企业号，corp account or not, default false
  nonceStrLength: 16,                                  // 随机字符串长度，最长32位，nonceStr length, default 16
  type: 'mem',                                         // 票据和token保存方式：file，本地文件，redis，保存在redis，mem，默认值，只缓存在内存，不保存到文件或者redis
  tokenFilename: __dirname + '/local-token.json',      // access_token存储文件，access_token local file，default:__dirname/local-token.json
  ticketFilename: __dirname + '/local-ticket.json'     // jsapi ticket存储文件，jsapi ticket local file，default:__dirname/local-ticket.json
  redisHost: '127.0.0.1',                              // redis server host ip
  redisPort: 6379,                                     // redis server port
  redisAuth: 'your reids passwrd'                      // redis password
}
```

## Change Log

+ 2018-4-24, 添加票据和token保存到redis
+ 2019-8-2, 默认会在保存一份token和ticket在运行内存，内存中token和ticket未过时时，直接使用内存数据
+ 2019-8-2, 添加Typescript types 文件
+ 2019-8-3, 更新usage

## License

[MIT License](http://www.opensource.org/licenses/mit-license.php)
