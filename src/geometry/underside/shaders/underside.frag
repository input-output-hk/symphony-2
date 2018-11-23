#pragma glslify: noise = require('glsl-noise/simplex/3d');

uniform vec3 diffuse;
uniform float opacity;
uniform float uTime;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>

#ifdef USE_MAP

	uniform sampler2D map;

#endif


#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

float circle(in float dist, in float radius) {
	return 1.0 - smoothstep(
		radius - (radius * 2.0),
		radius + (radius * 0.00001),
        dot(dist, dist) * 4.0
	);
}

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	
	#ifdef USE_MAP

		vec4 texelColor = texture2D( map, vUv );

		texelColor = mapTexelToLinear( texelColor );
		diffuseColor *= texelColor;


	#endif


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


	//float dist = dot(vUv-0.5 + noise(vUv*0.5) , vUv-0.5 + noise(vUv*0.5));
	float dist = dot(vUv-0.5, vUv-0.5);

	// dist += (noise(vec3(vUv, uTime*0.0005)) * 0.1);
		
	//diffuseColor.rgb += vec3(circle(dist, 0.9));
	outgoingLight.rgb += 3.0;

	outgoingLight.rgb *= 1.0-abs(
		sin(
			(dist * 5.0) - (uTime * 0.0005)
		)
	) + 0.05;
	
	outgoingLight.rgb -= abs(noise(vec3(vUv*10.0, uTime*0.0005)) *0.5);


	//diffuseColor.rgb *= noise((vUv + (uTime * 0.00000001)) * 5.0)) + 0.1;

	//diffuseColor.rgb += noise((vUv + (uTime * 0.00000001)) * 5.0) + 0.1;


	#include <envmap_fragment>

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <premultiplied_alpha_fragment>
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>

}
