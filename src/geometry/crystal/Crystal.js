// libs
import * as THREE from 'three'

// shaders
import fragmentShader from './shaders/crystal.frag'
import vertexShader from './shaders/crystal.vert'

import { map } from '../../utils/math'

export default class Crystal {
  getCentroid (coord) {
    var center = coord.reduce(function (x, y) {
      return [x[0] + y[0] / coord.length, x[1] + y[1] / coord.length]
    }, [0, 0])
    return center
  }

  create (block, voronoiDiagram, scene) {
    console.log(voronoiDiagram)

    this.instances = voronoiDiagram.cells.length

    let path = new THREE.LineCurve3()
    path.v1 = new THREE.Vector3(0.0, 0.0, 0.0)
    path.v2 = new THREE.Vector3(0.0, 0.0, 50.0)

    // let tubeGeo = new THREE.TubeBufferGeometry(path, 2, 1, 6, true)
    let tubeGeo = new THREE.CylinderBufferGeometry(1, 1, 1, 6)

    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeGeo)
    this.geometry.rotateX(Math.PI / 2)

    let offsets = new THREE.InstancedBufferAttribute(new Float32Array(this.instances * 2), 2)
    let scales = new THREE.InstancedBufferAttribute(new Float32Array(this.instances), 1)
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instances), 1)

    // get min/max tx value in block
    let maxTxValue = 0
    let minTxValue = Number.MAX_SAFE_INTEGER
    block.tx.forEach((tx) => {
      maxTxValue = Math.max(maxTxValue, tx.value)
      minTxValue = Math.min(minTxValue, tx.value)
    })

    for (let i = 0, ul = offsets.count; i < ul; i++) {
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

      // let radius = Math.max(0.01, (Math.sqrt(minDistToSite))) * 0.5
      let radius = Math.sqrt(minDistToSite) * 0.5

      let tx = block.tx[i]

      txValues.setX(
        i,
        map(tx.value, minTxValue, maxTxValue, 1.0, 5000.0)
      )

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
    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('txValue', txValues)

    this.material = new CrystalMaterial({
      color: 0xffffff,
      flatShading: true,
      metalness: 0.5,
      roughness: 0.5,
      transparent: true,
      opacity: 0.8
    })

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
