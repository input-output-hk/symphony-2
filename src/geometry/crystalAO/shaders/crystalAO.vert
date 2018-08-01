#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')

#define PHYSICAL

uniform float uTime;

attribute vec3 offset;
attribute vec2 planeOffset;
attribute float scale;
attribute float spentRatio;
attribute float txValue;
attribute vec4 quaternion;
attribute float txTime;

varying vec3 vViewPosition;
varying vec3 vTransformed;
varying vec3 vOffset;
varying float vSpentRatio;
varying float vTxValue;

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
	
	// envelope
	float attack = smoothstep(txTime, txTime + 5.0, uTime * 0.001);
	float release = (1.0 - smoothstep(txTime + 5.0, txTime + 10.0, uTime * 0.001));

	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );

    transformed.xz *= (scale * attack);
    
    transformed.xz += offset.xz;

	vTransformed = transformed;
	vOffset = offset;

	vTxValue = txValue;
	vSpentRatio = spentRatio;

	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	vViewPosition = - mvPosition.xyz;

	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
