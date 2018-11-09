uniform float uTime;
uniform float uOffset;
uniform vec3 uCamPos;
uniform float uRadiusMultiplier;
uniform vec2 uOriginOffset;
uniform float uMaxHeight;

varying vec4 vWorldPosition;

float maxDerivative;

const float PI = 3.14159265359;
const float twoPI = PI * 2.0;

// arc length of archimedes spiral
float arclength(float a, float theta) {
	float d = theta * length(theta);
	return a * d;
}

// calc where in the spiral a coordinate is
vec2 spiral(vec2 uv, float a, float radius) {
	float ang = atan(uv.y, uv.x);
	float turn = length(uv)/radius - ang/twoPI;
	ang += ceil(turn) * twoPI;
	float d = arclength(a, ang) + uOffset;
	
	return vec2(d, fract(turn)) * ((1.0 - step(d, 154387.0)) * (step(d, uMaxHeight + 152583.)));
}

float plane(vec2 uv, vec2 quadUV) {
    float top = smoothstep(0.475 * (1.0-maxDerivative), 0.476 + maxDerivative * 0.3, 1.0-uv.y);
    float bottom = smoothstep(0.475 * (1.0-maxDerivative), 0.476 + maxDerivative *0.3, uv.y);
    float left = smoothstep(0.1 * (1.0-maxDerivative*20.0), 0.1 * (1.0-maxDerivative*20.0), uv.x);
    float right = smoothstep(0.1 * (1.0-maxDerivative*20.0), 0.1 * (1.0-maxDerivative*20.0), 1.0-uv.x);
    //float pct = top * bottom * left * right;
     float pct = top * bottom;
    return pct;
}


vec3 calc(vec2 uv) {

	float radius = 0.001;
	float a = (radius / twoPI) * uRadiusMultiplier;

	vec2 s = spiral(uv, a, radius);
	if (s.x == 0.0) {
		return vec3(0.0);
	} else {
		vec2 planeUV = fract(s);
		return vec3(plane(planeUV, uv), s.x, s.y);
	}
}

#define PHYSICAL

uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;

#ifndef STANDARD
	uniform float clearCoat;
	uniform float clearCoatRoughness;
#endif

varying vec3 vViewPosition;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
//uniform mat3 uvTransform;
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <bsdfs>
#include <cube_uv_reflection_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <lights_physical_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>

	// accumulation
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>

	// modulation
	#include <aomap_fragment>

	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

	// get derivative of quad UV and blur based on this
	vec2 dt = fwidth(vUv-0.5) * 4000.0;
	maxDerivative = clamp(max(dt.t, dt.s), 0.0, 6.0);
	maxDerivative *= maxDerivative;

	vec3 s = calc(vUv-0.5);
	vec4 distVec = vWorldPosition - vec4(uCamPos, 0);
	float distToFragmentSq = dot(distVec, distVec);

	s.x *= min(1.0, distToFragmentSq* 0.000000001);

	outgoingLight += (1.0-(s.y*0.0000013)) * 0.3;
	//outgoingLight -= sin(1.0-((s.y + uTime) *0.002 )) * 0.025;
	outgoingLight -= sin(1.0-((s.y ) *0.002 )) * 0.025;

	gl_FragColor = vec4( outgoingLight, s.x );

	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>

}
