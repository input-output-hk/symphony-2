#pragma glslify: noise = require('glsl-noise/simplex/4d');
#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')
#pragma glslify: random = require('../../../shaders/random)

#define PHYSICAL

uniform float uTime;

attribute vec3 offset;
attribute vec2 planeOffset;
attribute float scale;
attribute float spentRatio;
attribute float blockHeight;
attribute vec3 barycentric;
attribute float topVertex;
attribute float centerTopVertex;
attribute float centerBottomVertex;
attribute float txValue;
attribute vec4 quaternion;

varying vec3 vViewPosition;
varying vec3 vTransformed;
varying vec3 vOffset;
varying float vScale;
varying float vSpentRatio;
varying vec3 vBarycentric;
varying float vTxValue;
varying float vTopVertex;
varying float vBottomVertex;
varying float vCenterTopVertex;
varying float vCenterBottomVertex;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

#ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED

	vNormal = normalize( transformedNormal );

#endif

	#include <begin_vertex>

	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );

    transformed.xz *= scale;
	
    transformed.y *= offset.y;
    transformed.y += offset.y * 0.5;
    transformed.xz += offset.xz;

	transformed.x += (random(transformed.x) * (scale * 0.4) - (scale * 0.2)) * centerTopVertex;
	transformed.z += (random(transformed.y) * (scale * 0.4) - (scale * 0.2)) * centerTopVertex;

	transformed.y += (random(transformed.z) * (offset.y * 0.02) - (offset.y * 0.01)) * topVertex * (1.0 - centerTopVertex);
	transformed.y += (offset.y * 0.03) * centerTopVertex;

	transformed.y -= 9.0 * centerBottomVertex;
	//transformed.y -= offset.y * 0.25 * centerBottomVertex;*/

	vTransformed = transformed;
	vOffset = offset;
	vTopVertex = topVertex;
	vBottomVertex = 1.0 - topVertex;
	vCenterBottomVertex = centerBottomVertex;

	vTxValue = txValue;
	vScale = scale;

	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	vViewPosition = - mvPosition.xyz;

	vSpentRatio = spentRatio;

	vBarycentric = barycentric;

	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
