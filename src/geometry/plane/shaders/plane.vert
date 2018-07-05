#define PHYSICAL

attribute vec3 offset;
attribute vec2 planeOffset;
attribute float blockHeight;
attribute vec4 quaternion;

float rand(float n){return fract(sin(n) * 43758.5453123);}

varying vec3 vViewPosition;
varying vec3 vTransformed;
varying vec3 vOffset;

// http://www.geeks3d.com/20141201/how-to-rotate-a-vertex-by-a-quaternion-in-glsl/
vec3 applyQuaternionToVector( vec4 q, vec3 v ){
	return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
}

mat4 rotationMatrix(vec3 axis, float angle) {
   axis = normalize(axis);
   float s = sin(angle);
   float c = cos(angle);
   float oc = 1.0 - c;

   return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
               oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
               oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
               0.0,                                0.0,                                0.0,                                1.0);
}

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

    //transformed.z *= offset.z;
    //transformed.z += offset.z * 0.5;
	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );

    transformed.xy += planeOffset.xy;

	float scaledHeight = blockHeight * 50.0;
	//transformed.z += scaledHeight;
	transformed.z -= 5.0;

	//transformed = (vec4(transformed.xyz, 0.0) * rotationMatrix( vec3(planeOffset.xy, scaledHeight), 0.1 )  ).xyz;

	vTransformed = transformed;
	vOffset = offset;

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
