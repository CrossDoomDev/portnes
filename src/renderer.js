import { makeMaterialFrame, materialScroll } from "./materials.js";

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = vec2(position.x, 1.0-position.y); gl_Position = vec4(position*2.0-1.0, 0.0, 1.0); }
`;
const FRAGMENT = `
precision mediump float;
uniform sampler2D frame;
uniform sampler2D atlas;
uniform vec2 scroll;
uniform float time;
uniform float original;
varying vec2 uv;
const vec2 resolution = vec2(256.0,240.0);
vec4 readPixel(vec2 p) { return texture2D(frame, (clamp(p,vec2(0.0),resolution-1.0)+0.5)/resolution); }
bool same(vec4 a,vec4 b) { return distance(a,b)<0.002; }
float sprite(vec4 p) { return step(7.5,p.a*255.0); }
void main() {
  vec2 pixel = floor(uv*resolution);
  vec2 local = fract(uv*resolution);
  vec4 e=readPixel(pixel);
  if(original>0.5) { gl_FragColor=vec4(e.rgb,1.0); return; }
  vec4 n=readPixel(pixel+vec2(0.0,-1.0));
  vec4 s=readPixel(pixel+vec2(0.0,1.0));
  vec4 w=readPixel(pixel+vec2(-1.0,0.0));
  vec4 r=readPixel(pixel+vec2(1.0,0.0));
  // Scale2x corners. This is purely visual; source hitboxes remain untouched.
  if(!same(n,s) && !same(w,r)) {
    if(local.x<0.5 && local.y<0.5 && same(w,n)) e=w;
    if(local.x>=0.5 && local.y<0.5 && same(n,r)) e=r;
    if(local.x<0.5 && local.y>=0.5 && same(w,s)) e=w;
    if(local.x>=0.5 && local.y>=0.5 && same(s,r)) e=r;
  }
  float material=mod(floor(e.a*255.0+0.5),8.0);
  float object=sprite(e);
  vec3 color=e.rgb;
  if(material<5.5) {
    float surface=material;
    if(object>0.5 && material<4.5) surface=4.0;
    vec2 coords=(uv*resolution+scroll)/128.0;
    if(surface>1.5 && surface<2.5) coords+=vec2(time*0.007,sin(time*0.4)*0.008);
    vec2 cell=vec2(mod(surface,3.0),floor(surface/3.0));
    vec2 atlasUV=(cell+0.002+fract(coords)*0.996)/vec2(3.0,2.0);
    vec3 textureColor=texture2D(atlas,atlasUV).rgb;
    float detail=dot(textureColor,vec3(0.299,0.587,0.114));
    color*=0.83+detail*0.42;
    float edge=dot(s.rgb-n.rgb,vec3(0.299,0.587,0.114));
    color+=clamp(edge,-0.09,0.09)*0.38;
    if(object<0.5 && sprite(readPixel(pixel-vec2(1.0,1.0)))>0.5) color*=0.72;
  }
  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}
`;

export class GameRenderer {
  constructor(
    canvas,
    atlasImage,
    { onContextLost = () => {}, onContextRestored = () => {} } = {},
  ) {
    this.canvas = canvas;
    this.atlasImage = atlasImage;
    this.mode = "new";
    this.pixels = new Uint8Array(245760);
    this.originalPixels = new Uint8Array(245760);
    // A software WebGL driver is much slower than Canvas for this small frame.
    // Detect it on a disposable canvas before choosing the final context type.
    const probe = document.createElement("canvas").getContext("webgl");
    const information = probe?.getExtension("WEBGL_debug_renderer_info");
    const driver = information
      ? probe.getParameter(information.UNMASKED_RENDERER_WEBGL)
      : "";
    const software = /swiftshader|llvmpipe|software|lavapipe/i.test(driver);
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = software
      ? null
      : canvas.getContext("webgl", {
          alpha: false,
          antialias: false,
          depth: false,
          preserveDrawingBuffer: true,
        });
    if (this.gl) {
      this.initGL();
      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.lost = true;
        onContextLost();
      });
      canvas.addEventListener("webglcontextrestored", () => {
        this.lost = false;
        this.initGL();
        onContextRestored();
      });
      this.backend = "WebGL";
    } else {
      this.ctx = canvas.getContext("2d", { alpha: false });
      if (!this.ctx) throw new Error("Браузер не поддерживает Canvas.");
      this.buffer = document.createElement("canvas");
      this.buffer.width = 256;
      this.buffer.height = 240;
      this.bufferCtx = this.buffer.getContext("2d");
      this.imageData = this.bufferCtx.createImageData(256, 240);
      const materials = document.createElement("canvas");
      materials.width = 384;
      materials.height = 256;
      const context = materials.getContext("2d", { willReadFrequently: true });
      context.drawImage(atlasImage, 0, 0, 384, 256);
      this.textureData = context.getImageData(0, 0, 384, 256).data;
      this.backend = "Canvas 2D";
    }
  }

  initGL() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX),
      fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW,
    );
    const location = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(
      ["frame", "atlas", "scroll", "time", "original"].map((name) => [
        name,
        gl.getUniformLocation(this.program, name),
      ]),
    );
    this.frameTexture = this.createTexture(0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      240,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    this.atlasTexture = this.createTexture(1, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.atlasImage,
    );
    gl.uniform1i(this.uniforms.frame, 0);
    gl.uniform1i(this.uniforms.atlas, 1);
  }

  createTexture(unit, smooth = false) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      smooth ? gl.LINEAR : gl.NEAREST,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      smooth ? gl.LINEAR : gl.NEAREST,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  draw(frame, ppu, seconds = 0) {
    if (!frame || this.lost) return;
    let pixels;
    if (this.mode === "original") {
      pixels = this.originalPixels;
      for (let i = 0; i < frame.length; i++) {
        const offset = i * 4;
        pixels[offset] = frame[i] & 255;
        pixels[offset + 1] = (frame[i] >> 8) & 255;
        pixels[offset + 2] = (frame[i] >> 16) & 255;
        pixels[offset + 3] = 255;
      }
    } else pixels = makeMaterialFrame(frame, ppu, this.pixels);
    if (this.gl) {
      const gl = this.gl;
      gl.useProgram(this.program);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        256,
        240,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      gl.uniform2fv(this.uniforms.scroll, materialScroll(ppu));
      gl.uniform1f(this.uniforms.time, seconds);
      gl.uniform1f(this.uniforms.original, this.mode === "original" ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      const data = this.imageData.data,
        [sx, sy] = materialScroll(ppu);
      for (let i = 0; i < frame.length; i++) {
        const offset = i * 4,
          material = pixels[offset + 3] & 7;
        let light = 1;
        if (this.mode !== "original" && material < 6) {
          const x = ((i % 256) + sx) & 127,
            y = (Math.floor(i / 256) + sy) & 127;
          const textureOffset =
            ((Math.floor(material / 3) * 128 + y) * 384 +
              (material % 3) * 128 +
              x) *
            4;
          light =
            0.83 +
            ((this.textureData[textureOffset] +
              this.textureData[textureOffset + 1] +
              this.textureData[textureOffset + 2]) /
              765) *
              0.42;
        }
        data[offset] = pixels[offset] * light;
        data[offset + 1] = pixels[offset + 1] * light;
        data[offset + 2] = pixels[offset + 2] * light;
        data[offset + 3] = 255;
      }
      this.bufferCtx.putImageData(this.imageData, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(
        this.buffer,
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      );
    }
  }
}
