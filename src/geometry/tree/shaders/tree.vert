#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')
#pragma glslify: random = require('../../../shaders/random')

#define PHYSICAL

attribute vec3 offset;
attribute vec2 planeOffset;
attribute vec4 quaternion;
attribute float display;

uniform float uTime;
uniform float uFirstLoop;
uniform vec2 uOriginOffset;

varying vec3 vViewPosition;
varying vec3 vTransformed;
varying vec3 vOffset;
varying float vDistanceFromCenter;

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

	if (display == 1.0) {

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
	
		vec3 dest = transformed.xyz;
		dest.x -= 10.0;
		dest.y -= 100.0;

		transformed.xz += (planeOffset.xy - uOriginOffset);


		//vDistanceFromCenter = distance(transformed.xyz, dest) + (random(transformed.xy) * 100.0 );
		vDistanceFromCenter = distance(transformed.xyz + vec3(0.0, 100.0, 0.0), dest * 10.0 );

		vTransformed = transformed;

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
}
