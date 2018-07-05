// libs
import * as THREE from 'three'

// shaders
import fragmentShader from './shaders/crystal.frag'
import vertexShader from './shaders/crystal.vert'

export default class Crystal {
  constructor (firebaseDB, planeOffsetMultiplier) {
    this.firebaseDB = firebaseDB
    this.docRefGeo = this.firebaseDB.collection('blocks_geometry')
    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')
    this.bumpMap = new THREE.TextureLoader().load('assets/images/textures/bumpMap.jpg')
    this.roughnessMap = new THREE.TextureLoader().load('assets/images/textures/roughnessMap.jpg')
    this.planeSize = 500
    this.planeOffsetMultiplier = planeOffsetMultiplier

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa-full/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.material = new CrystalMaterial({
      flatShading: true,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 1.0,
      roughness: 0.0,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
      // bumpMap: this.bumpMap,
      // bumpScale: 0.2
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.1, 0.1)
    })
  }

  async save (block, voronoiDiagram) {
    return new Promise((resolve, reject) => {
      this.instanceCount = voronoiDiagram.cells.length

      let offsets = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount * 2), 2)
      let scales = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)

      for (let i = 0; i < this.instanceCount; i++) {
        if (typeof block.tx[i] === 'undefined') {
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

      this.docRefGeo.doc(block.hash).set({
        offsets: JSON.stringify(geoData.offsets),
        scales: JSON.stringify(geoData.scales),
        height: block.height
      }, { merge: true })
        .then(function () {
          console.log('Document successfully written!')
          resolve(geoData)
        }).catch(function (error) {
          console.log('Error writing document: ', error)
        })
    })
  }

  async get (block, offsetsArray, scalesArray) {
    this.instanceCount = scalesArray.length

    let tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    tubeGeo.vertices[12].add(new THREE.Vector3(0, 0.01, 0))

    let tubeBufferGeo = new THREE.BufferGeometry().fromGeometry(tubeGeo)

    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeBufferGeo)
    this.geometry.rotateX(Math.PI / 2)

    let offsets = new THREE.InstancedBufferAttribute(new Float32Array(offsetsArray), 2)
    let scales = new THREE.InstancedBufferAttribute(new Float32Array(scalesArray), 1)
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)

    // get min/max tx value in block
    let maxTxValue = 0
    let minTxValue = Number.MAX_SAFE_INTEGER
    block.tx.forEach((tx) => {
      maxTxValue = Math.max(maxTxValue, tx.value)
      minTxValue = Math.min(minTxValue, tx.value)
    })

    if (minTxValue === maxTxValue) {
      minTxValue = 0
    }

    for (let i = 0; i < this.instanceCount; i++) {
      if (typeof block.tx[i] === 'undefined') {
        continue
      }
      let tx = block.tx[i]

      let txValue = tx.value * 0.00000001
      if (txValue > 1000) {
        txValue = 1000
      }

      txValues.setX(
        i,
        txValue
      )

      let spentCount = 0
      tx.out.forEach(function (el, index) {
        if (el.spent === 1) {
          spentCount++
        }
      })

      let spentRatio = 1
      if (spentCount !== 0) {
        spentRatio = spentCount / tx.out.length
      } else {
        spentRatio = 0.0
      }

      spentRatios.setX(
        i,
        spentRatio
      )
    }

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('txValue', txValues)
    this.geometry.addAttribute('spentRatio', spentRatios)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  async getMultiple (blockGeoData) {
    this.instanceCount = 0

    let blockHeightsArray = []
    let offsetsArray = []
    let txValuesArray = []
    let planeOffsetsArray = []
    let scalesArray = []
    let txArray = []

    let coils = 200
    let radius = 1000000
    let center = {x: 0, y: 0}

    // value of theta corresponding to end of last coil
    let thetaMax = coils * (Math.PI * 2)

    // How far to step away from center for each side.
    let awayStep = radius / thetaMax

    // distance between points to plot
    let chord = this.planeSize

    let blockIndex = 0

    for (const hash in blockGeoData) {
      if (blockGeoData.hasOwnProperty(hash)) {
        if (typeof this.theta === 'undefined') {
          let offset = this.planeSize * this.planeOffsetMultiplier
          let chord = this.planeSize + offset
          this.theta = chord / awayStep
        }

        let rotation = 0

        let away = awayStep * this.theta

        // How far around the center.
        let around = this.theta + rotation

        // Convert 'around' and 'away' to X and Y.
        let xOffset = center.x + Math.cos(around) * away
        let yOffset = center.y + Math.sin(around) * away

        let angle = -this.theta + (Math.PI / 2) + 0.015

        // to a first approximation, the points are on a circle
        // so the angle between them is chord/radius
        this.theta += chord / away

        var yRotMatrix = new THREE.Matrix3()
        yRotMatrix.set(
          Math.cos(angle), Math.sin(angle), 0,
          -Math.sin(angle), Math.cos(angle), 0,
          0, 0, 1
        )

        let block = blockGeoData[hash]
        this.instanceCount += block.scales.length

        for (let i = 0; i < block.offsets.length / 2; i++) {
          let x = block.offsets[i * 2 + 0]
          let y = block.offsets[i * 2 + 1]
          let z = 0

          let vector = new THREE.Vector3(x, y, z)

          vector.applyMatrix3(yRotMatrix)

          vector.x += xOffset
          vector.y += yOffset

          offsetsArray.push(vector.x)
          offsetsArray.push(vector.y)
          offsetsArray.push(vector.z)

          planeOffsetsArray.push(xOffset)
          planeOffsetsArray.push(yOffset)
        }

        block.scales.forEach((scale) => {
          scalesArray.push(scale)
          // blockHeightsArray.push(block.block.height)
          blockHeightsArray.push(blockIndex)
        })

        block.block.tx.forEach((tx) => {
          txArray.push(tx)
        })

        console.log('block at height: ' + block.block.height + ' added')

        blockIndex++
      }
    }

    // set up base geometry
    let tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    // tubeGeo.vertices[12].add(new THREE.Vector3(0, 0.03, 0))

    let tubeBufferGeo = new THREE.BufferGeometry().fromGeometry(tubeGeo)

    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeBufferGeo)
    this.geometry.rotateX(Math.PI / 2)

    // attributes
    let blockHeights = new THREE.InstancedBufferAttribute(new Float32Array(blockHeightsArray), 1)
    let offsets = new THREE.InstancedBufferAttribute(new Float32Array(offsetsArray), 3)
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)
    let planeOffsets = new THREE.InstancedBufferAttribute(new Float32Array(planeOffsetsArray), 2)
    let scales = new THREE.InstancedBufferAttribute(new Float32Array(scalesArray), 1)
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)

    console.log('this.instanceCount: ' + this.instanceCount)

    for (let i = 0; i < this.instanceCount; i++) {
      if (typeof txArray[i] === 'undefined') {
        continue
      }
      let tx = txArray[i]

      let txValue = (tx.value * 0.00000001) + 1.0
      if (txValue > 1000) {
        txValue = 1000
      }

      txValues.setX(
        i,
        txValue
      )

      offsets.setZ(
        i,
        txValue
      )

      let spentCount = 0
      tx.out.forEach(function (el, index) {
        if (el.spent === 1) {
          spentCount++
        }
      })

      let spentRatio = 1
      if (spentCount !== 0) {
        spentRatio = spentCount / tx.out.length
      } else {
        spentRatio = 0.0
      }

      spentRatios.setX(
        i,
        spentRatio
      )
    }

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('txValue', txValues)
    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('spentRatio', spentRatios)
    this.geometry.addAttribute('blockHeight', blockHeights)

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

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
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

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
