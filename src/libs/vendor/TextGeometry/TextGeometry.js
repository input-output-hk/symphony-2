import * as THREE from 'three'
import BufferVertexData from '../three-buffer-vertex-data'

let createLayout = require('layout-bmfont-text')
let createIndices = require('quad-indices')
let assign = require('object-assign')

let vertices = require('./lib/vertices')
let utils = require('./lib/utils')

export default class TextGeometry extends THREE.BufferGeometry {
  constructor (opt) {
    super()

    this.buffer = new BufferVertexData()

    if (typeof opt === 'string') {
      opt = { text: opt }
    }

    // use these as default values for any subsequent
    // calls to update()
    this.opt = assign({}, opt)

    // also do an initial setup...
    if (opt) {
      this.update(opt)
    }
  }

  update (opt) {
    if (typeof opt === 'string') {
      opt = { text: opt }
    }

    // use constructor defaults
    opt = assign({}, this.opt, opt)

    if (!opt.font) {
      throw new TypeError('must specify a { font } in options')
    }

    this.layout = createLayout(opt)

    // get vec2 texcoords
    let flipY = opt.flipY !== false

    // the desired BMFont data
    let font = opt.font

    // determine texture size from font file
    let texWidth = font.common.scaleW
    let texHeight = font.common.scaleH

    // get visible glyphs
    let glyphs = this.layout.glyphs.filter(function (glyph) {
      let bitmap = glyph.data
      return bitmap.width * bitmap.height > 0
    })

    // provide visible glyphs for convenience
    this.visibleGlyphs = glyphs

    // get common vertex data
    let positions = vertices.positions(glyphs)
    let uvs = vertices.uvs(glyphs, texWidth, texHeight, flipY)
    let indices = createIndices({
      clockwise: true,
      type: 'uint16',
      count: glyphs.length
    })

    // update vertex data
    this.buffer.setIndex(this, indices, 1, 'uint16')
    this.buffer.setAttribute(this, 'position', positions, 2)
    this.buffer.setAttribute(this, 'uv', uvs, 2)

    // update multipage data
    if (!opt.multipage && 'page' in this.attributes) {
      // disable multipage rendering
      this.removeAttribute('page')
    } else if (opt.multipage) {
      let pages = vertices.pages(glyphs)
      // enable multipage rendering
      this.buffer.setAttribute(this, 'page', pages, 1)
    }
  }

  computeBoundingSphere () {
    if (this.boundingSphere === null) {
      this.boundingSphere = new THREE.Sphere()
    }

    let positions = this.attributes.position.array
    let itemSize = this.attributes.position.itemSize
    if (!positions || !itemSize || positions.length < 2) {
      this.boundingSphere.radius = 0
      this.boundingSphere.center.set(0, 0, 0)
      return
    }
    utils.computeSphere(positions, this.boundingSphere)
    if (isNaN(this.boundingSphere.radius)) {
      console.error('THREE.BufferGeometry.computeBoundingSphere(): ' +
        'Computed radius is NaN. The ' +
        '"position" attribute is likely to have NaN values.')
    }
  }

  computeBoundingBox () {
    if (this.boundingBox === null) {
      this.boundingBox = new THREE.Box3()
    }

    let bbox = this.boundingBox
    let positions = this.attributes.position.array
    let itemSize = this.attributes.position.itemSize
    if (!positions || !itemSize || positions.length < 2) {
      bbox.makeEmpty()
      return
    }
    utils.computeBox(positions, bbox)
  }
}
