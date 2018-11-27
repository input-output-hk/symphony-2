// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/particles.frag'
import vertexShader from './shaders/particles.vert'
import PassThroughVert from './shaders/passThrough.vert'
import PassThroughFrag from './shaders/passThrough.frag'
import PositionFrag from './shaders/position.frag'

// helpers
import TextureHelper from './TextureHelper'

export default class Particles extends Base {
  constructor (args) {
    super(args)

    this.renderer = args.renderer

    this.particleCount = 10000

    this.frame = 0

    this.textureHelper = new TextureHelper()
    this.textureHelper.setTextureSize(this.particleCount)

    this.material = new ParticlesMaterial({
      color: 0x709eec,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      // depthWrite: false,
      // depthTest: false,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader
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

  updateOriginOffset (originOffset) {
    this.positionMaterial.uniforms.uOriginOffset.value = originOffset

    this.material.uniforms.uOriginOffset.value = originOffset
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
    this.renderer.render(this.passThroughScene, this.quadCamera, output)
  }

  async init (args) {
    this.renderer = args.renderer

    let positionTexture = this.textureHelper.createPositionTexture()
    this.defaultPositionTexture = this.textureHelper.createPositionTexture()

    this.passThroughTexture(
      positionTexture,
      this.positionRenderTarget1
    )
    this.passThroughTexture(this.positionRenderTarget1.texture, this.positionRenderTarget2)

    this.positionMaterial.uniforms.defaultPositionTexture.value = this.defaultPositionTexture
    this.material.uniforms.defaultPositionTexture.value = this.defaultPositionTexture

    this.positionScene = new THREE.Scene()

    this.positionMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.positionMaterial)
    this.positionScene.add(this.positionMesh)

    this.geometry = new THREE.BufferGeometry()

    let positionArray = new Float32Array(this.particleCount * 3)

    this.setTextureLocations(
      this.particleCount,
      positionArray
    )

    let position = new THREE.BufferAttribute(positionArray, 3)

    this.geometry.addAttribute('position', position)

    let idArray = new Float32Array(this.particleCount)
    for (let index = 0; index < idArray.length; index++) {
      idArray[index] = index
    }

    let id = new THREE.BufferAttribute(idArray, 1)
    this.geometry.addAttribute('id', id)

    // this.resize()

    this.mesh = new THREE.Points(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  updatePositions () {
    let inputPositionRenderTarget = this.positionRenderTarget1
    this.outputPositionRenderTarget = this.positionRenderTarget2
    if (this.frame % 2 === 0) {
      inputPositionRenderTarget = this.positionRenderTarget2
      this.outputPositionRenderTarget = this.positionRenderTarget1
    }
    this.positionMaterial.uniforms.positionTexture.value = inputPositionRenderTarget.texture

    this.renderer.render(this.positionScene, this.quadCamera, this.outputPositionRenderTarget)

    this.material.uniforms.positionTexture.value = this.outputPositionRenderTarget.texture
  }

  update (args) {
    this.frame++
    this.material.uniforms.uTime.value = args.time
    this.material.uniforms.uSpawnLocation.value = args.spawnLocation
    this.positionMaterial.uniforms.uTime.value = args.time
    this.updatePositions()
  }

  initCamera () {
    this.quadCamera = new THREE.OrthographicCamera()
    this.quadCamera.position.z = 1
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
}

class ParticlesMaterial extends THREE.PointsMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.points.uniforms

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

    this.uniforms.scale = {
      type: 'f',
      value: this.baseScale
    }

    this.uniforms.uSpawnLocation = {
      type: 'v3',
      value: new THREE.Vector3(0.0, 0.0, 0.0)
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
