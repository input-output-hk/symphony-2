'use strict'

import * as THREE from 'three'

/**
 * Simple promise based wrapper around THREE js texture loader
 */

export default class TextureLoaderWrapper {
  constructor (type, basePath) {
    this.loader = null
    switch (type) {
      case 'texture':
        this.loader = new THREE.TextureLoader().setPath(basePath)
        break
      case 'cubeTexture':
        this.loader = new THREE.CubeTextureLoader().setPath(basePath)
        break
    }
  }

  load (path, key) {
    return new Promise(function (resolve, reject) {
      this.loader.load(
        path,
        function (texture) {
          let returnData = {
            texture: texture,
            key: key
          }
          resolve(returnData)
        },
        undefined,
        function (error) {
          reject(error)
        }
    )
    }.bind(this))
  }
}
