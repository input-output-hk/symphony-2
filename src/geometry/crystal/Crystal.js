// libs
import * as THREE from 'three'
import SimplexNoise from 'simplex-noise'
import { map } from '../../utils/math'
import Voronoi from 'voronoi'
import VoronoiTools from '../../utils/VoronoiTools'
import seedrandom from 'seedrandom'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/crystal.frag'
import vertexShader from './shaders/crystal.vert'

export default class Crystal extends Base {
  constructor (args) {
    super(args)
    this.firebaseDB = args.firebaseDB
    this.docRefGeo = this.firebaseDB.collection('bitcoin_blocks_geometry')
    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')

    this.normalMap.minFilter = THREE.NearestFilter

    this.voronoi = new Voronoi()

    this.instanceTotal = 10 * 3000

    this.txCount = 0

    this.uTime = 0

    this.txIndexOffsets = {}

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa-full/')
      .load([
        '0004.jpg',
        '0002.jpg',
        '0006.jpg',
        '0005.jpg',
        '0001.jpg',
        '0003.jpg'
      ])

    this.material = new CrystalMaterial({
      flatShading: true,
      opacity: 1,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 0.6,
      roughness: 0.18,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.01, 0.01),
      alphaMap: this.alphaMap,
      bumpMap: this.bumpMap,
      roughnessMap: this.roughnessMap,
      bumpScale: 0.01
    })
  }

  async save (blockData) {
    return new Promise((resolve, reject) => {
      console.log('Block geo data: ' + blockData.hash + ' does not exist in the db, adding...')
      let pointCount = Math.max(blockData.n_tx, 4)

      const simplex = new SimplexNoise(blockData.height)

      const voronoiTools = new VoronoiTools(this.voronoi, blockData.height, this.planeSize)

      let sites = []

      Math.seedrandom(blockData.height)

      for (let index = 0; index < pointCount; index++) {
        let found = false
        let x = 0
        let y = 0

        while (found === false) {
          x = Math.floor(Math.random() * this.planeSize - (this.planeSize / 2))
          y = Math.floor(Math.random() * this.planeSize - (this.planeSize / 2))

          let noiseVal = simplex.noise2D(x / 300, y / 300)

          if (((Math.random() * 5) * noiseVal) > -0.3) {
            let exists = false
            for (let existsIndex = 0; existsIndex < sites.length; existsIndex++) {
              const site = sites[existsIndex]
              if (site.x === x && site.y === y) {
                exists = true
                break
              }
            }
            if (!exists) {
              found = true
            }
          }
        }
        sites.push({x: x, y: y})
      }

      let voronoiDiagram = this.voronoi.compute(sites, {
        xl: -this.planeSize / 2,
        xr: this.planeSize / 2,
        yt: -this.planeSize / 2,
        yb: this.planeSize / 2
      })

      // work out network health
      let feeToValueRatio = 0
      if (blockData.outputTotal !== 0) {
        feeToValueRatio = blockData.fee / blockData.outputTotal
      }

      let blockHealth = map(feeToValueRatio, 0, 0.0001, 20, 0)
      if (blockHealth < 0) {
        blockHealth = 0
      }

      let relaxIterations = Math.round(blockHealth)

      if (blockData.n_tx > 1) {
        for (let index = 0; index < relaxIterations; index++) {
          try {
            voronoiDiagram = voronoiTools.relaxSites(voronoiDiagram)
          } catch (error) {
            console.log(error)
          }
        }
      }

      let offsets = new THREE.InstancedBufferAttribute(new Float32Array(blockData.tx.length * 2), 2)
      let scales = new THREE.InstancedBufferAttribute(new Float32Array(blockData.tx.length), 1)

      for (let i = 0; i < blockData.tx.length; i++) {
        if (typeof blockData.tx[i] === 'undefined') {
          continue
        }
        let cell = voronoiDiagram.cells[i]

        let site = new THREE.Vector2(cell.site.x, cell.site.y)

        // look at all adjacent cells and get the closest site to this site
        let minDistToSite = Number.MAX_SAFE_INTEGER

        cell.halfedges.forEach((halfEdge, index) => {
          if (halfEdge.edge.rSite !== null) {
            let distanceToSiteSq = new THREE.Vector2(halfEdge.edge.rSite.x, halfEdge.edge.rSite.y).distanceToSquared(site)
            if (distanceToSiteSq > 0) {
              minDistToSite = Math.min(minDistToSite, distanceToSiteSq)
            }
          }
          if (halfEdge.edge.lSite !== null) {
            let distanceToSiteSq = new THREE.Vector2(halfEdge.edge.lSite.x, halfEdge.edge.lSite.y).distanceToSquared(site)
            if (distanceToSiteSq > 0) {
              minDistToSite = Math.min(minDistToSite, distanceToSiteSq)
            }
          }
        })

        let radius = Math.sqrt(minDistToSite) * 0.5

        let planeXEdgeDist = (this.planeSize / 2) - Math.abs(site.x)
        let planeYEdgeDist = (this.planeSize / 2) - Math.abs(site.y)

        if (planeXEdgeDist < radius) {
          radius = planeXEdgeDist
        }
        if (planeYEdgeDist < radius) {
          radius = planeYEdgeDist
        }

        offsets.setXY(
          i,
          site.x,
          site.y
        )

        scales.setX(
          i,
          radius
        )
      }

      let geoData = {
        offsets: offsets.array,
        scales: scales.array
      }

      this.docRefGeo.doc(blockData.hash).set({
        offsets: JSON.stringify(geoData.offsets),
        scales: JSON.stringify(geoData.scales),
        height: blockData.height
      }, { merge: true })
        .then(function () {
          console.log('Geo data for block: ' + blockData.hash + ' successfully written')
          resolve(geoData)
        }).catch(function (error) {
          console.log('Error writing document: ', error)
        })
    })
  }

  async init (blockGeoData) {
    this.offsetsArray = new Float32Array(this.instanceTotal * 3)

    this.scalesArray = new Float32Array(this.instanceTotal)
    this.quatArray = new Float32Array(this.instanceTotal * 4)
    this.isHovered = new Float32Array(this.instanceTotal)
    this.isSelected = new Float32Array(this.instanceTotal)

    let blockPosition = blockGeoData.blockData.pos

    // set up base geometry
    let tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    tubeGeo.vertices[12].add(new THREE.Vector3(0, 0.01, 0))
    tubeGeo.vertices[0].add(new THREE.Vector3(0, 0.02, 0))
    tubeGeo.vertices[1].add(new THREE.Vector3(0, 0.02, 0))
    tubeGeo.vertices[2].add(new THREE.Vector3(0, 0.01, 0))
    tubeGeo.vertices[4].sub(new THREE.Vector3(0, 0.01, 0))

    let tubeBufferGeo = new THREE.BufferGeometry().fromGeometry(tubeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeBufferGeo)

    // attributes
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let txTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let offsets = new THREE.InstancedBufferAttribute(this.offsetsArray, 3)
    let scales = new THREE.InstancedBufferAttribute(this.scalesArray, 1)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)
    let isHovered = new THREE.InstancedBufferAttribute(this.isHovered, 1)
    let isSelected = new THREE.InstancedBufferAttribute(this.isSelected, 1)
    let blockStartTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let blockLoadTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      offsets,
      quaternions,
      scales,
      txValues,
      spentRatios,
      txTimes
    )

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('txValue', txValues)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('spentRatio', spentRatios)
    this.geometry.addAttribute('quaternion', quaternions)
    this.geometry.addAttribute('txTime', txTimes)
    this.geometry.addAttribute('blockStartTime', blockStartTimes)
    this.geometry.addAttribute('blockLoadTime', blockLoadTimes)
    this.geometry.addAttribute('isHovered', isHovered)
    this.geometry.addAttribute('isSelected', isSelected)

    const positionAttrib = this.geometry.getAttribute('position')

    let barycentric = []

    // for each triangle in the geometry, add the barycentric coordinates
    for (let i = 0; i < positionAttrib.count / 3; i++) {
      if (
        i === 23 ||
        i === 22 ||
        i === 21 ||
        i === 20 ||
        i === 19 ||
        i === 18 ||
        i === 17 ||
        i === 16 ||
        i === 15 ||
        i === 14 ||
        i === 13 ||
        i === 12
      ) {
        barycentric.push(
          0, 0, 0,
          0, 0, 0,
          0, 0, 0
        )
      } else if (i % 2 === 0) {
        barycentric.push(
          0, 0, 1,
          0, 1, 0,
          1, 0, 1
        )
      } else {
        barycentric.push(
          0, 1, 0,
          0, 0, 1,
          1, 0, 1
        )
      }
    }

    const array = new Float32Array(barycentric)
    const attribute = new THREE.BufferAttribute(array, 3)
    this.geometry.addAttribute('barycentric', attribute)

    let centerTopVertex = [
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0
    ]

    const CTVArray = new Float32Array(centerTopVertex)
    const CTVAttribute = new THREE.BufferAttribute(CTVArray, 1)
    this.geometry.addAttribute('centerTopVertex', CTVAttribute)

    let centerBottomVertex = [
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1

    ]

    const CBVArray = new Float32Array(centerBottomVertex)
    const CBVAttribute = new THREE.BufferAttribute(CBVArray, 1)
    this.geometry.addAttribute('centerBottomVertex', CBVAttribute)

    let topVertex = [
      1, 0, 1,
      0, 0, 1,
      1, 0, 1,

      0, 0, 1,
      1, 0, 1,
      0, 0, 1,

      1, 0, 1,
      0, 0, 1,
      1, 0, 1,

      0, 0, 1,
      1, 0, 1,
      0, 0, 1,

      1, 1, 1,
      1, 1, 1,
      1, 1, 1,

      1, 1, 1,
      1, 1, 1,
      1, 1, 1,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0
    ]

    const TVArray = new Float32Array(topVertex)
    const TVAttribute = new THREE.BufferAttribute(TVArray, 1)
    this.geometry.addAttribute('topVertex', TVAttribute)

    this.txCount += blockGeoData.blockData.tx.length

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  updateBlockStartTimes (blockData) {
    const txIndexOffset = this.txIndexOffsets[blockData.height]
    const offsetTime = window.performance.now()

    for (let i = 0; i < blockData.tx.length; i++) {
      this.geometry.attributes.blockStartTime.array[txIndexOffset + i] = offsetTime
    }

    this.geometry.attributes.blockStartTime.needsUpdate = true
  }

  updateBlockLoadTimes (blockData) {
    const txIndexOffset = this.txIndexOffsets[blockData.height]
    const offsetTime = window.performance.now()

    for (let i = 0; i < blockData.tx.length; i++) {
      this.geometry.attributes.blockLoadTime.array[txIndexOffset + i] = offsetTime
    }

    this.geometry.attributes.blockLoadTime.needsUpdate = true
  }

  async updateGeometry (blockGeoData) {
    if (this.txCount + blockGeoData.blockData.tx.length > this.instanceTotal) {
      this.txCount = 0
    }

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      this.geometry.attributes.offset,
      this.geometry.attributes.quaternion,
      this.geometry.attributes.scale,
      this.geometry.attributes.txValue,
      this.geometry.attributes.spentRatio,
      this.geometry.attributes.txTime
    )

    this.txCount += blockGeoData.blockData.tx.length

    this.updateBlockStartTimes(blockGeoData.blockData)
    this.updateBlockLoadTimes(blockGeoData.blockData)
  }

  update (args) {
    this.material.uniforms.uTime.value = args.time
    this.material.uniforms.uAudioTime.value = args.time
    this.material.uniforms.uCamPos.value = args.camPos
    this.material.uniforms.uCamPosYPositive.value = args.camPos.y > 1
    this.material.uniforms.uAutoPilot.value = args.autoPilot
  }
}

class CrystalMaterial extends THREE.MeshStandardMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uAutoPilot = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uCamPos = {
      type: 'v3',
      value: new THREE.Vector3(0.0, 0.0, 0.0)
    }

    this.uniforms.uCamPosYPositive = {
      type: 'f',
      value: 1.0
    }

    this.uniforms.uAudioTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
