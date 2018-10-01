#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')

#define PHYSICAL

attribute vec3 offset;
attribute vec2 planeOffset;

uniform vec2 uOriginOffset;

attribute vec4 quaternion;

varying vec3 vViewPosition;

varying vec3 vWorldPosition;

varying vec3 vTransformed;
varying vec3 vOffset;
varying vec2 vPlaneOffset;
varying vec3 vPosition;

uniform vec3 uCubePos;

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

	vPlaneOffset = planeOffset;

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
    transformed.xz += (planeOffset.xy - uOriginOffset);

	vTransformed = transformed;
	vOffset = offset;

	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	vViewPosition = - mvPosition.xyz;
	vPosition = vec3(modelMatrix * vec4(position, 1.0));

	#include <worldpos_vertex>

	vWorldPosition = worldPosition.xyz;

	#include <shadowmap_vertex>
	#include <fog_vertex>

}
