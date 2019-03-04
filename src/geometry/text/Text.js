// libs
import * as THREE from 'three'
import TextGeometry from '../../libs/vendor/TextGeometry/TextGeometry'
const loadFont = require('load-bmfont')

export default class Text {
  constructor (args) {
    this.fontTexture = null

    this.textureLoader = new THREE.TextureLoader()
    this.SDFShader = require('../../libs/vendor/TextGeometry/shaders/sdf')

    this.defaultFontName = 'dejavu'

    this.maxAnisotropy = args.maxAnisotropy

    this.fontPaths = {
      'dejavu': {
        font: '../../assets/fonts/DejaVu-sdf.fnt',
        image: '../../assets/fonts/DejaVu-sdf.png'
      }
    }

    this.loadedFonts = {}
  }

  async loadFontTexture (fontName) {
    return new Promise((resolve, reject) => {
      if (typeof this.loadedFonts[fontName] === 'undefined') {
        loadFont(this.fontPaths[fontName].font, async function (err, font) {
          if (!err) {
            this.textureLoader.load(this.fontPaths[fontName].image, async function (texture) {
              texture.needsUpdate = true
              texture.minFilter = THREE.LinearMipMapLinearFilter
              texture.magFilter = THREE.LinearFilter
              texture.generateMipmaps = true
              texture.anisotropy = this.maxAnisotropy

              this.loadedFonts[fontName] = {
                font: font,
                texture: texture
              }

              resolve(this.loadedFonts[fontName])
            }.bind(this))
          } else {
            reject(err)
          }
        }.bind(this))
      } else {
        resolve(this.loadedFonts[fontName])
      }
    })
  }

  async create (args) {
    if (!args.fontName) {
      args.fontName = this.defaultFontName
    }

    let fontData = await this.loadFontTexture(args.fontName)

    let geometry = new TextGeometry({
      width: args.width,
      align: args.align,
      font: fontData.font,
      flipY: fontData.texture.flipY,
      text: args.text,
      lineHeight: args.lineHeight
    })

    let material = new THREE.RawShaderMaterial(this.SDFShader({
      map: fontData.texture,
      side: THREE.DoubleSide,
      transparent: true,
      color: 0xffffff
      // blending: THREE.AdditiveBlending
    }))

    let mesh = new THREE.Mesh(geometry, material)

    mesh.scale.set(args.scale, args.scale, args.scale)
    mesh.position.x = args.position.x
    mesh.position.y = args.position.y
    mesh.position.z = args.position.z
    mesh.frustumCulled = false

    return mesh
  }
}
