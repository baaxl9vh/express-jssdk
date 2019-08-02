
import express from 'express';



declare namespace jssdk {
  
  type SaveType = 'file' | 'redis' | 'mem';

  /**
   * 配置项
   */
  interface JSSDKOptions {
    /**
     * 是否企业号
     */
    corp?: boolean,
    /**
     * 公众号appId
     */
    appId: string,
    /**
     * 公众号secret
     */
    secret: string,
    /**
     * 随机字符串长度，最长32位
     */
    nonceStrLength?: number,
    /**
     * ticket和token持久化类型，默认file，可选redis、内存mem
     */
    type?: SaveType,
    /**
     * redis host
     */
    redisHost?: string,
    /**
     * redis port
     */
    redisPort?: number,
    /**
     * redis password
     */
    redisAuth?: string,
    /**
     * token 缓存文件
     */
    tokenFilename?: string,
    /**
     * ticket 缓存文件
     */
    ticketFilename?: string,
  }
}

declare function jssdk(options?: jssdk.JSSDKOptions): express.RequestHandler;

export = jssdk;