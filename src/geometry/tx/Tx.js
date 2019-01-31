// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/tx.frag'
import vertexShader from './shaders/tx.vert'
import PassThroughVert from './shaders/passThrough.vert'
import PassThroughFrag from './shaders/passThrough.frag'
import PositionFrag from './shaders/position.frag'
import TextureHelper from './TextureHelper'

export default class Tx extends Base {
  constructor (args) {
    super(args)

    this.frame = 0

    this.instanceTotal = 500

    this.textureHelper = new TextureHelper(args)
    this.textureHelper.setTextureSize(this.instanceTotal)

    this.material = new TxMaterial({
      flatShading: true,
      // color: 0x709eec,
      color: 0xffffff,
      opacity: 0.6,
      transparent: true,
      fog: false
    })

    this.textureHeight = this.textureHelper.textureHeight
    this.textureWidth = this.textureHelper.textureWidth

    this.positionMaterial = new THREE.ShaderMaterial({
      uniforms: {
        positionTexture: {
          type: 't',
          value: null
        },
        defaultPositionTexture: {
          type: 't',
          value: null
        },
        uOriginOffset: {
          type: 'v2',
          value: new THREE.Vector2(0.0, 0.0)
        },
        uTime: {
          type: 'f',
          value: 0.0
        }
      },
      vertexShader: PassThroughVert,
      fragmentShader: PositionFrag
    })

    this.initCamera()

    this.initPassThrough()

    this.positionRenderTarget1 = new THREE.WebGLRenderTarget(this.textureWidth, this.textureHeight, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: this.config.floatType,
      depthWrite: false,
      depthBuffer: false,
      stencilBuffer: false
    })

    this.positionRenderTarget2 = this.positionRenderTarget1.clone()

    this.outputPositionRenderTarget = this.positionRenderTarget1
  }

  initCamera () {
    this.quadCamera = new THREE.OrthographicCamera()
    this.quadCamera.position.z = 1
  }

  initPassThrough () {
    this.passThroughScene = new THREE.Scene()
    this.passThroughMaterial = new THREE.ShaderMaterial({
      uniforms: {
        texture: {
          type: 't',
          value: null
        }
      },
      vertexShader: PassThroughVert,
      fragmentShader: PassThroughFrag
    })
    let mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.passThroughMaterial)
    this.passThroughScene.add(mesh)
  }

  passThroughTexture (input, output) {
    this.passThroughMaterial.uniforms.texture.value = input
    if (this.renderer.vr.enabled) {
      this.renderer.vr.enabled = false
    }
    this.renderer.render(this.passThroughScene, this.quadCamera, output)
  }

  setTextureLocations (
    nodeCount,
    positionArray
  ) {
    for (let i = 0; i < nodeCount; i++) {
      let textureLocation = this.textureHelper.getNodeTextureLocation(i)
      positionArray[i * 3 + 0] = textureLocation.x
      positionArray[i * 3 + 1] = textureLocation.y
    }
  }

  async init (args) {
    this.renderer = args.renderer
    this.txHeights = args.txHeights

    let blockPositions = args.blockPositions

    let positionData = this.textureHelper.createPositionTexture(blockPositions, this.txHeights)
    this.defaultPositionTexture = positionData.positionTexture

    this.quatArray = positionData.quatArray

    this.passThroughTexture(
      positionData.positionTexture,
      this.positionRenderTarget1
    )
    this.passThroughTexture(this.positionRenderTarget1.texture, this.positionRenderTarget2)

    this.positionMaterial.uniforms.defaultPositionTexture.value = this.defaultPositionTexture
    this.material.uniforms.defaultPositionTexture.value = this.defaultPositionTexture

    this.positionScene = new THREE.Scene()

    this.positionMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.positionMaterial)
    this.positionScene.add(this.positionMesh)

    let coneGeo = new THREE.CylinderGeometry(0, 200, 80000, 3, 64)
    let coneBufferGeo = new THREE.BufferGeometry().fromGeometry(coneGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(coneBufferGeo)
    this.geometry.rotateX(Math.PI / 2)
    this.geometry.rotateY(Math.PI)

    let positionArray = new Float32Array(this.instanceTotal * 3)

    this.setTextureLocations(
      this.instanceTotal,
      positionArray
    )

    let offsets = new THREE.InstancedBufferAttribute(positionArray, 3)
    this.geometry.addAttribute('offset', offsets)

    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  async updateGeometry (args) {
    this.renderer = args.renderer
    this.txHeights = args.txHeights
    let blockPositions = args.blockPositions

    let positionData = this.textureHelper.createPositionTexture(blockPositions, this.txHeights)
    this.defaultPositionTexture = positionData.positionTexture

    this.quatArray = positionData.quatArray

    this.positionMaterial.uniforms.defaultPositionTexture.value = this.defaultPositionTexture
    this.material.uniforms.defaultPositionTexture.value = this.defaultPositionTexture

    this.geometry.attributes.quaternion.array = this.quatArray
    this.geometry.attributes.quaternion.needsUpdate = true
  }

  update (time) {
    this.frame++
    this.material.uniforms.uTime.value = time

    this.updatePositions()
  }

  updateOriginOffset (originOffset) {
    this.positionMaterial.uniforms.uOriginOffset.value = originOffset
    this.material.uniforms.uOriginOffset.value = originOffset
  }

  updatePositions () {
    let inputPositionRenderTarget = this.positionRenderTarget1
    this.outputPositionRenderTarget = this.positionRenderTarget2
    if (this.frame % 2 === 0) {
      inputPositionRenderTarget = this.positionRenderTarget2
      this.outputPositionRenderTarget = this.positionRenderTarget1
    }
    this.positionMaterial.uniforms.positionTexture.value = inputPositionRenderTarget.texture

    if (this.renderer.vr.enabled) {
      this.renderer.vr.enabled = false
    }
    this.renderer.render(this.positionScene, this.quadCamera, this.outputPositionRenderTarget)

    this.material.uniforms.positionTexture.value = this.outputPositionRenderTarget.texture

    this.positionMaterial.uniforms.defaultPositionTexture.value = this.defaultPositionTexture
    this.material.uniforms.defaultPositionTexture.value = this.defaultPositionTexture
  }
}

class TxMaterial extends THREE.MeshBasicMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.positionTexture = {
      type: 't',
      value: null
    }

    this.uniforms.defaultPositionTexture = {
      type: 't',
      value: null
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
