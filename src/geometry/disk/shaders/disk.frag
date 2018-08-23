uniform float uTime;

// forked from https://www.shadertoy.com/view/lsS3WV
const float PI = 3.14159265359;
const float twoPI = PI * 2.0;
//const float radius = 0.00333333333;
const float radius =   0.001;
const float a = (radius / twoPI) * 8199.110;

// arc length of archimedes spiral
float arclength(float a, float theta) {
	float d = theta * length(theta);
	return a * d;
}

// calc where in the spiral a coordinate is
vec2 spiral(vec2 uv) {
	float ang = atan(uv.y, uv.x);
	float turn = length(uv)/radius - ang/twoPI;
	ang += ceil(turn) * twoPI;
	float d = arclength(a, ang) + 0.0;

	// 537971
	// + 9061

	if (d < 33629. || d > 570032.0) {
		return vec2(0.0,0.0);
	} else {
		return vec2(d, fract(turn));
	}
}

float plane(vec2 uv, vec2 quadUV) {
	// get derivative of quad UV and blur based on this
	vec2 dFQuad = fwidth(quadUV) * 3000.0;
	float maxDerivative =  clamp(max(dFQuad.t, dFQuad.s), 0.0, 5.0);
	maxDerivative *= maxDerivative;
    float top = smoothstep(0.475 * (1.0-maxDerivative), 0.476, 1.0-uv.y);
    float bottom = smoothstep(0.475 * (1.0-maxDerivative), 0.476, uv.y);
    float left = smoothstep(0.1 * (1.0-maxDerivative*20.0), 0.1 * (1.0-maxDerivative*20.0), uv.x);
    float right = smoothstep(0.1 * (1.0-maxDerivative*20.0), 0.1 * (1.0-maxDerivative*20.0), 1.0-uv.x);
    float pct = top * bottom * left * right;
    return pct;
}


float calc(vec2 uv) {
	vec2 s = spiral(uv);
	if (s.x == 0.0) {
		return 0.0;
	} else {
		vec2 planeUV = fract(s);
		return plane(planeUV, uv);
	}
}

uniform vec3 diffuse;
uniform float opacity;


#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <color_pars_fragment>
	varying vec2 vUv;
	uniform mat3 uvTransform;
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <specularmap_fragment>

	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

	// accumulation (baked indirect lighting only)
	#ifdef USE_LIGHTMAP

		reflectedLight.indirectDiffuse += texture2D( lightMap, vUv2 ).xyz * lightMapIntensity;

	#else

		reflectedLight.indirectDiffuse += vec3( 1.0 );

	#endif

	// modulation
	#include <aomap_fragment>

	reflectedLight.indirectDiffuse *= diffuseColor.rgb;

	vec3 outgoingLight = reflectedLight.indirectDiffuse;

	#include <envmap_fragment>

	float s = calc(vUv - 0.5);

	gl_FragColor = vec4( outgoingLight, s * 0.8 );

	#include <premultiplied_alpha_fragment>
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>

}
