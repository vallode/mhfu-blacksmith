"use strict";(()=>{var po=Object.create;var Hr=Object.defineProperty;var io=Object.getOwnPropertyDescriptor;var lo=Object.getOwnPropertyNames;var mo=Object.getPrototypeOf,co=Object.prototype.hasOwnProperty;var uo=(a,e)=>()=>(a&&(e=a(a=0)),e);var ja=(a,e)=>()=>(e||a((e={exports:{}}).exports,e),e.exports);var yo=(a,e,r,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of lo(e))!co.call(a,n)&&n!==r&&Hr(a,n,{get:()=>e[n],enumerable:!(s=io(e,n))||s.enumerable});return a};var Oa=(a,e,r)=>(r=a!=null?po(mo(a)):{},yo(e||!a||!a.__esModule?Hr(r,"default",{value:a,enumerable:!0}):r,a));var Pr=ja(ra=>{"use strict";f();ra.byteLength=ho;ra.toByteArray=go;ra.fromByteArray=So;var Q=[],z=[],fo=typeof Uint8Array<"u"?Uint8Array:Array,Ka="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";for(fe=0,Dr=Ka.length;fe<Dr;++fe)Q[fe]=Ka[fe],z[Ka.charCodeAt(fe)]=fe;var fe,Dr;z[45]=62;z[95]=63;function Lr(a){var e=a.length;if(e%4>0)throw new Error("Invalid string. Length must be a multiple of 4");var r=a.indexOf("=");r===-1&&(r=e);var s=r===e?0:4-r%4;return[r,s]}function ho(a){var e=Lr(a),r=e[0],s=e[1];return(r+s)*3/4-s}function bo(a,e,r){return(e+r)*3/4-r}function go(a){var e,r=Lr(a),s=r[0],n=r[1],o=new fo(bo(a,s,n)),t=0,i=n>0?s-4:s,p;for(p=0;p<i;p+=4)e=z[a.charCodeAt(p)]<<18|z[a.charCodeAt(p+1)]<<12|z[a.charCodeAt(p+2)]<<6|z[a.charCodeAt(p+3)],o[t++]=e>>16&255,o[t++]=e>>8&255,o[t++]=e&255;return n===2&&(e=z[a.charCodeAt(p)]<<2|z[a.charCodeAt(p+1)]>>4,o[t++]=e&255),n===1&&(e=z[a.charCodeAt(p)]<<10|z[a.charCodeAt(p+1)]<<4|z[a.charCodeAt(p+2)]>>2,o[t++]=e>>8&255,o[t++]=e&255),o}function _o(a){return Q[a>>18&63]+Q[a>>12&63]+Q[a>>6&63]+Q[a&63]}function wo(a,e,r){for(var s,n=[],o=e;o<r;o+=3)s=(a[o]<<16&16711680)+(a[o+1]<<8&65280)+(a[o+2]&255),n.push(_o(s));return n.join("")}function So(a){for(var e,r=a.length,s=r%3,n=[],o=16383,t=0,i=r-s;t<i;t+=o)n.push(wo(a,t,t+o>i?i:t+o));return s===1?(e=a[r-1],n.push(Q[e>>2]+Q[e<<4&63]+"==")):s===2&&(e=(a[r-2]<<8)+a[r-1],n.push(Q[e>>10]+Q[e>>4&63]+Q[e<<2&63]+"=")),n.join("")}});var Fr=ja(Na=>{f();Na.read=function(a,e,r,s,n){var o,t,i=n*8-s-1,p=(1<<i)-1,m=p>>1,c=-7,l=r?n-1:0,u=r?-1:1,d=a[e+l];for(l+=u,o=d&(1<<-c)-1,d>>=-c,c+=i;c>0;o=o*256+a[e+l],l+=u,c-=8);for(t=o&(1<<-c)-1,o>>=-c,c+=s;c>0;t=t*256+a[e+l],l+=u,c-=8);if(o===0)o=1-m;else{if(o===p)return t?NaN:(d?-1:1)*(1/0);t=t+Math.pow(2,s),o=o-m}return(d?-1:1)*t*Math.pow(2,o-s)};Na.write=function(a,e,r,s,n,o){var t,i,p,m=o*8-n-1,c=(1<<m)-1,l=c>>1,u=n===23?Math.pow(2,-24)-Math.pow(2,-77):0,d=s?0:o-1,y=s?1:-1,b=e<0||e===0&&1/e<0?1:0;for(e=Math.abs(e),isNaN(e)||e===1/0?(i=isNaN(e)?1:0,t=c):(t=Math.floor(Math.log(e)/Math.LN2),e*(p=Math.pow(2,-t))<1&&(t--,p*=2),t+l>=1?e+=u/p:e+=u*Math.pow(2,1-l),e*p>=2&&(t++,p/=2),t+l>=c?(i=0,t=c):t+l>=1?(i=(e*p-1)*Math.pow(2,n),t=t+l):(i=e*Math.pow(2,l-1)*Math.pow(2,n),t=0));n>=8;a[r+d]=i&255,d+=y,i/=256,n-=8);for(t=t<<n|i,m+=n;m>0;a[r+d]=t&255,d+=y,t/=256,m-=8);a[r+d-y]|=b*128}});var oa=ja(Ee=>{"use strict";f();var Va=Pr(),ve=Fr(),Ur=typeof Symbol=="function"&&typeof Symbol.for=="function"?Symbol.for("nodejs.util.inspect.custom"):null;Ee.Buffer=h;Ee.SlowBuffer=Go;Ee.INSPECT_MAX_BYTES=50;var sa=2147483647;Ee.kMaxLength=sa;h.TYPED_ARRAY_SUPPORT=ko();!h.TYPED_ARRAY_SUPPORT&&typeof console<"u"&&typeof console.error=="function"&&console.error("This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support.");function ko(){try{let a=new Uint8Array(1),e={foo:function(){return 42}};return Object.setPrototypeOf(e,Uint8Array.prototype),Object.setPrototypeOf(a,e),a.foo()===42}catch{return!1}}Object.defineProperty(h.prototype,"parent",{enumerable:!0,get:function(){if(h.isBuffer(this))return this.buffer}});Object.defineProperty(h.prototype,"offset",{enumerable:!0,get:function(){if(h.isBuffer(this))return this.byteOffset}});function se(a){if(a>sa)throw new RangeError('The value "'+a+'" is invalid for option "size"');let e=new Uint8Array(a);return Object.setPrototypeOf(e,h.prototype),e}function h(a,e,r){if(typeof a=="number"){if(typeof e=="string")throw new TypeError('The "string" argument must be of type string. Received type number');return qa(a)}return Nr(a,e,r)}h.poolSize=8192;function Nr(a,e,r){if(typeof a=="string")return vo(a,e);if(ArrayBuffer.isView(a))return Bo(a);if(a==null)throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type "+typeof a);if(Y(a,ArrayBuffer)||a&&Y(a.buffer,ArrayBuffer)||typeof SharedArrayBuffer<"u"&&(Y(a,SharedArrayBuffer)||a&&Y(a.buffer,SharedArrayBuffer)))return Wa(a,e,r);if(typeof a=="number")throw new TypeError('The "value" argument must not be of type number. Received type number');let s=a.valueOf&&a.valueOf();if(s!=null&&s!==a)return h.from(s,e,r);let n=Eo(a);if(n)return n;if(typeof Symbol<"u"&&Symbol.toPrimitive!=null&&typeof a[Symbol.toPrimitive]=="function")return h.from(a[Symbol.toPrimitive]("string"),e,r);throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type "+typeof a)}h.from=function(a,e,r){return Nr(a,e,r)};Object.setPrototypeOf(h.prototype,Uint8Array.prototype);Object.setPrototypeOf(h,Uint8Array);function Vr(a){if(typeof a!="number")throw new TypeError('"size" argument must be of type number');if(a<0)throw new RangeError('The value "'+a+'" is invalid for option "size"')}function xo(a,e,r){return Vr(a),a<=0?se(a):e!==void 0?typeof r=="string"?se(a).fill(e,r):se(a).fill(e):se(a)}h.alloc=function(a,e,r){return xo(a,e,r)};function qa(a){return Vr(a),se(a<0?0:Xa(a)|0)}h.allocUnsafe=function(a){return qa(a)};h.allocUnsafeSlow=function(a){return qa(a)};function vo(a,e){if((typeof e!="string"||e==="")&&(e="utf8"),!h.isEncoding(e))throw new TypeError("Unknown encoding: "+e);let r=zr(a,e)|0,s=se(r),n=s.write(a,e);return n!==r&&(s=s.slice(0,n)),s}function za(a){let e=a.length<0?0:Xa(a.length)|0,r=se(e);for(let s=0;s<e;s+=1)r[s]=a[s]&255;return r}function Bo(a){if(Y(a,Uint8Array)){let e=new Uint8Array(a);return Wa(e.buffer,e.byteOffset,e.byteLength)}return za(a)}function Wa(a,e,r){if(e<0||a.byteLength<e)throw new RangeError('"offset" is outside of buffer bounds');if(a.byteLength<e+(r||0))throw new RangeError('"length" is outside of buffer bounds');let s;return e===void 0&&r===void 0?s=new Uint8Array(a):r===void 0?s=new Uint8Array(a,e):s=new Uint8Array(a,e,r),Object.setPrototypeOf(s,h.prototype),s}function Eo(a){if(h.isBuffer(a)){let e=Xa(a.length)|0,r=se(e);return r.length===0||a.copy(r,0,0,e),r}if(a.length!==void 0)return typeof a.length!="number"||Za(a.length)?se(0):za(a);if(a.type==="Buffer"&&Array.isArray(a.data))return za(a.data)}function Xa(a){if(a>=sa)throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x"+sa.toString(16)+" bytes");return a|0}function Go(a){return+a!=a&&(a=0),h.alloc(+a)}h.isBuffer=function(e){return e!=null&&e._isBuffer===!0&&e!==h.prototype};h.compare=function(e,r){if(Y(e,Uint8Array)&&(e=h.from(e,e.offset,e.byteLength)),Y(r,Uint8Array)&&(r=h.from(r,r.offset,r.byteLength)),!h.isBuffer(e)||!h.isBuffer(r))throw new TypeError('The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array');if(e===r)return 0;let s=e.length,n=r.length;for(let o=0,t=Math.min(s,n);o<t;++o)if(e[o]!==r[o]){s=e[o],n=r[o];break}return s<n?-1:n<s?1:0};h.isEncoding=function(e){switch(String(e).toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"latin1":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return!0;default:return!1}};h.concat=function(e,r){if(!Array.isArray(e))throw new TypeError('"list" argument must be an Array of Buffers');if(e.length===0)return h.alloc(0);let s;if(r===void 0)for(r=0,s=0;s<e.length;++s)r+=e[s].length;let n=h.allocUnsafe(r),o=0;for(s=0;s<e.length;++s){let t=e[s];if(Y(t,Uint8Array))o+t.length>n.length?(h.isBuffer(t)||(t=h.from(t)),t.copy(n,o)):Uint8Array.prototype.set.call(n,t,o);else if(h.isBuffer(t))t.copy(n,o);else throw new TypeError('"list" argument must be an Array of Buffers');o+=t.length}return n};function zr(a,e){if(h.isBuffer(a))return a.length;if(ArrayBuffer.isView(a)||Y(a,ArrayBuffer))return a.byteLength;if(typeof a!="string")throw new TypeError('The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type '+typeof a);let r=a.length,s=arguments.length>2&&arguments[2]===!0;if(!s&&r===0)return 0;let n=!1;for(;;)switch(e){case"ascii":case"latin1":case"binary":return r;case"utf8":case"utf-8":return $a(a).length;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return r*2;case"hex":return r>>>1;case"base64":return es(a).length;default:if(n)return s?-1:$a(a).length;e=(""+e).toLowerCase(),n=!0}}h.byteLength=zr;function To(a,e,r){let s=!1;if((e===void 0||e<0)&&(e=0),e>this.length||((r===void 0||r>this.length)&&(r=this.length),r<=0)||(r>>>=0,e>>>=0,r<=e))return"";for(a||(a="utf8");;)switch(a){case"hex":return Fo(this,e,r);case"utf8":case"utf-8":return $r(this,e,r);case"ascii":return Lo(this,e,r);case"latin1":case"binary":return Po(this,e,r);case"base64":return Ho(this,e,r);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return Uo(this,e,r);default:if(s)throw new TypeError("Unknown encoding: "+a);a=(a+"").toLowerCase(),s=!0}}h.prototype._isBuffer=!0;function he(a,e,r){let s=a[e];a[e]=a[r],a[r]=s}h.prototype.swap16=function(){let e=this.length;if(e%2!==0)throw new RangeError("Buffer size must be a multiple of 16-bits");for(let r=0;r<e;r+=2)he(this,r,r+1);return this};h.prototype.swap32=function(){let e=this.length;if(e%4!==0)throw new RangeError("Buffer size must be a multiple of 32-bits");for(let r=0;r<e;r+=4)he(this,r,r+3),he(this,r+1,r+2);return this};h.prototype.swap64=function(){let e=this.length;if(e%8!==0)throw new RangeError("Buffer size must be a multiple of 64-bits");for(let r=0;r<e;r+=8)he(this,r,r+7),he(this,r+1,r+6),he(this,r+2,r+5),he(this,r+3,r+4);return this};h.prototype.toString=function(){let e=this.length;return e===0?"":arguments.length===0?$r(this,0,e):To.apply(this,arguments)};h.prototype.toLocaleString=h.prototype.toString;h.prototype.equals=function(e){if(!h.isBuffer(e))throw new TypeError("Argument must be a Buffer");return this===e?!0:h.compare(this,e)===0};h.prototype.inspect=function(){let e="",r=Ee.INSPECT_MAX_BYTES;return e=this.toString("hex",0,r).replace(/(.{2})/g,"$1 ").trim(),this.length>r&&(e+=" ... "),"<Buffer "+e+">"};Ur&&(h.prototype[Ur]=h.prototype.inspect);h.prototype.compare=function(e,r,s,n,o){if(Y(e,Uint8Array)&&(e=h.from(e,e.offset,e.byteLength)),!h.isBuffer(e))throw new TypeError('The "target" argument must be one of type Buffer or Uint8Array. Received type '+typeof e);if(r===void 0&&(r=0),s===void 0&&(s=e?e.length:0),n===void 0&&(n=0),o===void 0&&(o=this.length),r<0||s>e.length||n<0||o>this.length)throw new RangeError("out of range index");if(n>=o&&r>=s)return 0;if(n>=o)return-1;if(r>=s)return 1;if(r>>>=0,s>>>=0,n>>>=0,o>>>=0,this===e)return 0;let t=o-n,i=s-r,p=Math.min(t,i),m=this.slice(n,o),c=e.slice(r,s);for(let l=0;l<p;++l)if(m[l]!==c[l]){t=m[l],i=c[l];break}return t<i?-1:i<t?1:0};function Wr(a,e,r,s,n){if(a.length===0)return-1;if(typeof r=="string"?(s=r,r=0):r>2147483647?r=2147483647:r<-2147483648&&(r=-2147483648),r=+r,Za(r)&&(r=n?0:a.length-1),r<0&&(r=a.length+r),r>=a.length){if(n)return-1;r=a.length-1}else if(r<0)if(n)r=0;else return-1;if(typeof e=="string"&&(e=h.from(e,s)),h.isBuffer(e))return e.length===0?-1:jr(a,e,r,s,n);if(typeof e=="number")return e=e&255,typeof Uint8Array.prototype.indexOf=="function"?n?Uint8Array.prototype.indexOf.call(a,e,r):Uint8Array.prototype.lastIndexOf.call(a,e,r):jr(a,[e],r,s,n);throw new TypeError("val must be string, number or Buffer")}function jr(a,e,r,s,n){let o=1,t=a.length,i=e.length;if(s!==void 0&&(s=String(s).toLowerCase(),s==="ucs2"||s==="ucs-2"||s==="utf16le"||s==="utf-16le")){if(a.length<2||e.length<2)return-1;o=2,t/=2,i/=2,r/=2}function p(c,l){return o===1?c[l]:c.readUInt16BE(l*o)}let m;if(n){let c=-1;for(m=r;m<t;m++)if(p(a,m)===p(e,c===-1?0:m-c)){if(c===-1&&(c=m),m-c+1===i)return c*o}else c!==-1&&(m-=m-c),c=-1}else for(r+i>t&&(r=t-i),m=r;m>=0;m--){let c=!0;for(let l=0;l<i;l++)if(p(a,m+l)!==p(e,l)){c=!1;break}if(c)return m}return-1}h.prototype.includes=function(e,r,s){return this.indexOf(e,r,s)!==-1};h.prototype.indexOf=function(e,r,s){return Wr(this,e,r,s,!0)};h.prototype.lastIndexOf=function(e,r,s){return Wr(this,e,r,s,!1)};function Co(a,e,r,s){r=Number(r)||0;let n=a.length-r;s?(s=Number(s),s>n&&(s=n)):s=n;let o=e.length;s>o/2&&(s=o/2);let t;for(t=0;t<s;++t){let i=parseInt(e.substr(t*2,2),16);if(Za(i))return t;a[r+t]=i}return t}function Ro(a,e,r,s){return na($a(e,a.length-r),a,r,s)}function Mo(a,e,r,s){return na(No(e),a,r,s)}function Ao(a,e,r,s){return na(es(e),a,r,s)}function Io(a,e,r,s){return na(Vo(e,a.length-r),a,r,s)}h.prototype.write=function(e,r,s,n){if(r===void 0)n="utf8",s=this.length,r=0;else if(s===void 0&&typeof r=="string")n=r,s=this.length,r=0;else if(isFinite(r))r=r>>>0,isFinite(s)?(s=s>>>0,n===void 0&&(n="utf8")):(n=s,s=void 0);else throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");let o=this.length-r;if((s===void 0||s>o)&&(s=o),e.length>0&&(s<0||r<0)||r>this.length)throw new RangeError("Attempt to write outside buffer bounds");n||(n="utf8");let t=!1;for(;;)switch(n){case"hex":return Co(this,e,r,s);case"utf8":case"utf-8":return Ro(this,e,r,s);case"ascii":case"latin1":case"binary":return Mo(this,e,r,s);case"base64":return Ao(this,e,r,s);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return Io(this,e,r,s);default:if(t)throw new TypeError("Unknown encoding: "+n);n=(""+n).toLowerCase(),t=!0}};h.prototype.toJSON=function(){return{type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)}};function Ho(a,e,r){return e===0&&r===a.length?Va.fromByteArray(a):Va.fromByteArray(a.slice(e,r))}function $r(a,e,r){r=Math.min(a.length,r);let s=[],n=e;for(;n<r;){let o=a[n],t=null,i=o>239?4:o>223?3:o>191?2:1;if(n+i<=r){let p,m,c,l;switch(i){case 1:o<128&&(t=o);break;case 2:p=a[n+1],(p&192)===128&&(l=(o&31)<<6|p&63,l>127&&(t=l));break;case 3:p=a[n+1],m=a[n+2],(p&192)===128&&(m&192)===128&&(l=(o&15)<<12|(p&63)<<6|m&63,l>2047&&(l<55296||l>57343)&&(t=l));break;case 4:p=a[n+1],m=a[n+2],c=a[n+3],(p&192)===128&&(m&192)===128&&(c&192)===128&&(l=(o&15)<<18|(p&63)<<12|(m&63)<<6|c&63,l>65535&&l<1114112&&(t=l))}}t===null?(t=65533,i=1):t>65535&&(t-=65536,s.push(t>>>10&1023|55296),t=56320|t&1023),s.push(t),n+=i}return Do(s)}var Or=4096;function Do(a){let e=a.length;if(e<=Or)return String.fromCharCode.apply(String,a);let r="",s=0;for(;s<e;)r+=String.fromCharCode.apply(String,a.slice(s,s+=Or));return r}function Lo(a,e,r){let s="";r=Math.min(a.length,r);for(let n=e;n<r;++n)s+=String.fromCharCode(a[n]&127);return s}function Po(a,e,r){let s="";r=Math.min(a.length,r);for(let n=e;n<r;++n)s+=String.fromCharCode(a[n]);return s}function Fo(a,e,r){let s=a.length;(!e||e<0)&&(e=0),(!r||r<0||r>s)&&(r=s);let n="";for(let o=e;o<r;++o)n+=zo[a[o]];return n}function Uo(a,e,r){let s=a.slice(e,r),n="";for(let o=0;o<s.length-1;o+=2)n+=String.fromCharCode(s[o]+s[o+1]*256);return n}h.prototype.slice=function(e,r){let s=this.length;e=~~e,r=r===void 0?s:~~r,e<0?(e+=s,e<0&&(e=0)):e>s&&(e=s),r<0?(r+=s,r<0&&(r=0)):r>s&&(r=s),r<e&&(r=e);let n=this.subarray(e,r);return Object.setPrototypeOf(n,h.prototype),n};function L(a,e,r){if(a%1!==0||a<0)throw new RangeError("offset is not uint");if(a+e>r)throw new RangeError("Trying to access beyond buffer length")}h.prototype.readUintLE=h.prototype.readUIntLE=function(e,r,s){e=e>>>0,r=r>>>0,s||L(e,r,this.length);let n=this[e],o=1,t=0;for(;++t<r&&(o*=256);)n+=this[e+t]*o;return n};h.prototype.readUintBE=h.prototype.readUIntBE=function(e,r,s){e=e>>>0,r=r>>>0,s||L(e,r,this.length);let n=this[e+--r],o=1;for(;r>0&&(o*=256);)n+=this[e+--r]*o;return n};h.prototype.readUint8=h.prototype.readUInt8=function(e,r){return e=e>>>0,r||L(e,1,this.length),this[e]};h.prototype.readUint16LE=h.prototype.readUInt16LE=function(e,r){return e=e>>>0,r||L(e,2,this.length),this[e]|this[e+1]<<8};h.prototype.readUint16BE=h.prototype.readUInt16BE=function(e,r){return e=e>>>0,r||L(e,2,this.length),this[e]<<8|this[e+1]};h.prototype.readUint32LE=h.prototype.readUInt32LE=function(e,r){return e=e>>>0,r||L(e,4,this.length),(this[e]|this[e+1]<<8|this[e+2]<<16)+this[e+3]*16777216};h.prototype.readUint32BE=h.prototype.readUInt32BE=function(e,r){return e=e>>>0,r||L(e,4,this.length),this[e]*16777216+(this[e+1]<<16|this[e+2]<<8|this[e+3])};h.prototype.readBigUInt64LE=ne(function(e){e=e>>>0,Be(e,"offset");let r=this[e],s=this[e+7];(r===void 0||s===void 0)&&Ke(e,this.length-8);let n=r+this[++e]*2**8+this[++e]*2**16+this[++e]*2**24,o=this[++e]+this[++e]*2**8+this[++e]*2**16+s*2**24;return BigInt(n)+(BigInt(o)<<BigInt(32))});h.prototype.readBigUInt64BE=ne(function(e){e=e>>>0,Be(e,"offset");let r=this[e],s=this[e+7];(r===void 0||s===void 0)&&Ke(e,this.length-8);let n=r*2**24+this[++e]*2**16+this[++e]*2**8+this[++e],o=this[++e]*2**24+this[++e]*2**16+this[++e]*2**8+s;return(BigInt(n)<<BigInt(32))+BigInt(o)});h.prototype.readIntLE=function(e,r,s){e=e>>>0,r=r>>>0,s||L(e,r,this.length);let n=this[e],o=1,t=0;for(;++t<r&&(o*=256);)n+=this[e+t]*o;return o*=128,n>=o&&(n-=Math.pow(2,8*r)),n};h.prototype.readIntBE=function(e,r,s){e=e>>>0,r=r>>>0,s||L(e,r,this.length);let n=r,o=1,t=this[e+--n];for(;n>0&&(o*=256);)t+=this[e+--n]*o;return o*=128,t>=o&&(t-=Math.pow(2,8*r)),t};h.prototype.readInt8=function(e,r){return e=e>>>0,r||L(e,1,this.length),this[e]&128?(255-this[e]+1)*-1:this[e]};h.prototype.readInt16LE=function(e,r){e=e>>>0,r||L(e,2,this.length);let s=this[e]|this[e+1]<<8;return s&32768?s|4294901760:s};h.prototype.readInt16BE=function(e,r){e=e>>>0,r||L(e,2,this.length);let s=this[e+1]|this[e]<<8;return s&32768?s|4294901760:s};h.prototype.readInt32LE=function(e,r){return e=e>>>0,r||L(e,4,this.length),this[e]|this[e+1]<<8|this[e+2]<<16|this[e+3]<<24};h.prototype.readInt32BE=function(e,r){return e=e>>>0,r||L(e,4,this.length),this[e]<<24|this[e+1]<<16|this[e+2]<<8|this[e+3]};h.prototype.readBigInt64LE=ne(function(e){e=e>>>0,Be(e,"offset");let r=this[e],s=this[e+7];(r===void 0||s===void 0)&&Ke(e,this.length-8);let n=this[e+4]+this[e+5]*2**8+this[e+6]*2**16+(s<<24);return(BigInt(n)<<BigInt(32))+BigInt(r+this[++e]*2**8+this[++e]*2**16+this[++e]*2**24)});h.prototype.readBigInt64BE=ne(function(e){e=e>>>0,Be(e,"offset");let r=this[e],s=this[e+7];(r===void 0||s===void 0)&&Ke(e,this.length-8);let n=(r<<24)+this[++e]*2**16+this[++e]*2**8+this[++e];return(BigInt(n)<<BigInt(32))+BigInt(this[++e]*2**24+this[++e]*2**16+this[++e]*2**8+s)});h.prototype.readFloatLE=function(e,r){return e=e>>>0,r||L(e,4,this.length),ve.read(this,e,!0,23,4)};h.prototype.readFloatBE=function(e,r){return e=e>>>0,r||L(e,4,this.length),ve.read(this,e,!1,23,4)};h.prototype.readDoubleLE=function(e,r){return e=e>>>0,r||L(e,8,this.length),ve.read(this,e,!0,52,8)};h.prototype.readDoubleBE=function(e,r){return e=e>>>0,r||L(e,8,this.length),ve.read(this,e,!1,52,8)};function K(a,e,r,s,n,o){if(!h.isBuffer(a))throw new TypeError('"buffer" argument must be a Buffer instance');if(e>n||e<o)throw new RangeError('"value" argument is out of bounds');if(r+s>a.length)throw new RangeError("Index out of range")}h.prototype.writeUintLE=h.prototype.writeUIntLE=function(e,r,s,n){if(e=+e,r=r>>>0,s=s>>>0,!n){let i=Math.pow(2,8*s)-1;K(this,e,r,s,i,0)}let o=1,t=0;for(this[r]=e&255;++t<s&&(o*=256);)this[r+t]=e/o&255;return r+s};h.prototype.writeUintBE=h.prototype.writeUIntBE=function(e,r,s,n){if(e=+e,r=r>>>0,s=s>>>0,!n){let i=Math.pow(2,8*s)-1;K(this,e,r,s,i,0)}let o=s-1,t=1;for(this[r+o]=e&255;--o>=0&&(t*=256);)this[r+o]=e/t&255;return r+s};h.prototype.writeUint8=h.prototype.writeUInt8=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,1,255,0),this[r]=e&255,r+1};h.prototype.writeUint16LE=h.prototype.writeUInt16LE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,2,65535,0),this[r]=e&255,this[r+1]=e>>>8,r+2};h.prototype.writeUint16BE=h.prototype.writeUInt16BE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,2,65535,0),this[r]=e>>>8,this[r+1]=e&255,r+2};h.prototype.writeUint32LE=h.prototype.writeUInt32LE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,4,4294967295,0),this[r+3]=e>>>24,this[r+2]=e>>>16,this[r+1]=e>>>8,this[r]=e&255,r+4};h.prototype.writeUint32BE=h.prototype.writeUInt32BE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,4,4294967295,0),this[r]=e>>>24,this[r+1]=e>>>16,this[r+2]=e>>>8,this[r+3]=e&255,r+4};function qr(a,e,r,s,n){Yr(e,s,n,a,r,7);let o=Number(e&BigInt(4294967295));a[r++]=o,o=o>>8,a[r++]=o,o=o>>8,a[r++]=o,o=o>>8,a[r++]=o;let t=Number(e>>BigInt(32)&BigInt(4294967295));return a[r++]=t,t=t>>8,a[r++]=t,t=t>>8,a[r++]=t,t=t>>8,a[r++]=t,r}function Xr(a,e,r,s,n){Yr(e,s,n,a,r,7);let o=Number(e&BigInt(4294967295));a[r+7]=o,o=o>>8,a[r+6]=o,o=o>>8,a[r+5]=o,o=o>>8,a[r+4]=o;let t=Number(e>>BigInt(32)&BigInt(4294967295));return a[r+3]=t,t=t>>8,a[r+2]=t,t=t>>8,a[r+1]=t,t=t>>8,a[r]=t,r+8}h.prototype.writeBigUInt64LE=ne(function(e,r=0){return qr(this,e,r,BigInt(0),BigInt("0xffffffffffffffff"))});h.prototype.writeBigUInt64BE=ne(function(e,r=0){return Xr(this,e,r,BigInt(0),BigInt("0xffffffffffffffff"))});h.prototype.writeIntLE=function(e,r,s,n){if(e=+e,r=r>>>0,!n){let p=Math.pow(2,8*s-1);K(this,e,r,s,p-1,-p)}let o=0,t=1,i=0;for(this[r]=e&255;++o<s&&(t*=256);)e<0&&i===0&&this[r+o-1]!==0&&(i=1),this[r+o]=(e/t>>0)-i&255;return r+s};h.prototype.writeIntBE=function(e,r,s,n){if(e=+e,r=r>>>0,!n){let p=Math.pow(2,8*s-1);K(this,e,r,s,p-1,-p)}let o=s-1,t=1,i=0;for(this[r+o]=e&255;--o>=0&&(t*=256);)e<0&&i===0&&this[r+o+1]!==0&&(i=1),this[r+o]=(e/t>>0)-i&255;return r+s};h.prototype.writeInt8=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,1,127,-128),e<0&&(e=255+e+1),this[r]=e&255,r+1};h.prototype.writeInt16LE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,2,32767,-32768),this[r]=e&255,this[r+1]=e>>>8,r+2};h.prototype.writeInt16BE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,2,32767,-32768),this[r]=e>>>8,this[r+1]=e&255,r+2};h.prototype.writeInt32LE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,4,2147483647,-2147483648),this[r]=e&255,this[r+1]=e>>>8,this[r+2]=e>>>16,this[r+3]=e>>>24,r+4};h.prototype.writeInt32BE=function(e,r,s){return e=+e,r=r>>>0,s||K(this,e,r,4,2147483647,-2147483648),e<0&&(e=4294967295+e+1),this[r]=e>>>24,this[r+1]=e>>>16,this[r+2]=e>>>8,this[r+3]=e&255,r+4};h.prototype.writeBigInt64LE=ne(function(e,r=0){return qr(this,e,r,-BigInt("0x8000000000000000"),BigInt("0x7fffffffffffffff"))});h.prototype.writeBigInt64BE=ne(function(e,r=0){return Xr(this,e,r,-BigInt("0x8000000000000000"),BigInt("0x7fffffffffffffff"))});function Jr(a,e,r,s,n,o){if(r+s>a.length)throw new RangeError("Index out of range");if(r<0)throw new RangeError("Index out of range")}function Zr(a,e,r,s,n){return e=+e,r=r>>>0,n||Jr(a,e,r,4,34028234663852886e22,-34028234663852886e22),ve.write(a,e,r,s,23,4),r+4}h.prototype.writeFloatLE=function(e,r,s){return Zr(this,e,r,!0,s)};h.prototype.writeFloatBE=function(e,r,s){return Zr(this,e,r,!1,s)};function Qr(a,e,r,s,n){return e=+e,r=r>>>0,n||Jr(a,e,r,8,17976931348623157e292,-17976931348623157e292),ve.write(a,e,r,s,52,8),r+8}h.prototype.writeDoubleLE=function(e,r,s){return Qr(this,e,r,!0,s)};h.prototype.writeDoubleBE=function(e,r,s){return Qr(this,e,r,!1,s)};h.prototype.copy=function(e,r,s,n){if(!h.isBuffer(e))throw new TypeError("argument should be a Buffer");if(s||(s=0),!n&&n!==0&&(n=this.length),r>=e.length&&(r=e.length),r||(r=0),n>0&&n<s&&(n=s),n===s||e.length===0||this.length===0)return 0;if(r<0)throw new RangeError("targetStart out of bounds");if(s<0||s>=this.length)throw new RangeError("Index out of range");if(n<0)throw new RangeError("sourceEnd out of bounds");n>this.length&&(n=this.length),e.length-r<n-s&&(n=e.length-r+s);let o=n-s;return this===e&&typeof Uint8Array.prototype.copyWithin=="function"?this.copyWithin(r,s,n):Uint8Array.prototype.set.call(e,this.subarray(s,n),r),o};h.prototype.fill=function(e,r,s,n){if(typeof e=="string"){if(typeof r=="string"?(n=r,r=0,s=this.length):typeof s=="string"&&(n=s,s=this.length),n!==void 0&&typeof n!="string")throw new TypeError("encoding must be a string");if(typeof n=="string"&&!h.isEncoding(n))throw new TypeError("Unknown encoding: "+n);if(e.length===1){let t=e.charCodeAt(0);(n==="utf8"&&t<128||n==="latin1")&&(e=t)}}else typeof e=="number"?e=e&255:typeof e=="boolean"&&(e=Number(e));if(r<0||this.length<r||this.length<s)throw new RangeError("Out of range index");if(s<=r)return this;r=r>>>0,s=s===void 0?this.length:s>>>0,e||(e=0);let o;if(typeof e=="number")for(o=r;o<s;++o)this[o]=e;else{let t=h.isBuffer(e)?e:h.from(e,n),i=t.length;if(i===0)throw new TypeError('The value "'+e+'" is invalid for argument "value"');for(o=0;o<s-r;++o)this[o+r]=t[o%i]}return this};var xe={};function Ja(a,e,r){xe[a]=class extends r{constructor(){super(),Object.defineProperty(this,"message",{value:e.apply(this,arguments),writable:!0,configurable:!0}),this.name=`${this.name} [${a}]`,this.stack,delete this.name}get code(){return a}set code(n){Object.defineProperty(this,"code",{configurable:!0,enumerable:!0,value:n,writable:!0})}toString(){return`${this.name} [${a}]: ${this.message}`}}}Ja("ERR_BUFFER_OUT_OF_BOUNDS",function(a){return a?`${a} is outside of buffer bounds`:"Attempt to access memory outside buffer bounds"},RangeError);Ja("ERR_INVALID_ARG_TYPE",function(a,e){return`The "${a}" argument must be of type number. Received type ${typeof e}`},TypeError);Ja("ERR_OUT_OF_RANGE",function(a,e,r){let s=`The value of "${a}" is out of range.`,n=r;return Number.isInteger(r)&&Math.abs(r)>2**32?n=Kr(String(r)):typeof r=="bigint"&&(n=String(r),(r>BigInt(2)**BigInt(32)||r<-(BigInt(2)**BigInt(32)))&&(n=Kr(n)),n+="n"),s+=` It must be ${e}. Received ${n}`,s},RangeError);function Kr(a){let e="",r=a.length,s=a[0]==="-"?1:0;for(;r>=s+4;r-=3)e=`_${a.slice(r-3,r)}${e}`;return`${a.slice(0,r)}${e}`}function jo(a,e,r){Be(e,"offset"),(a[e]===void 0||a[e+r]===void 0)&&Ke(e,a.length-(r+1))}function Yr(a,e,r,s,n,o){if(a>r||a<e){let t=typeof e=="bigint"?"n":"",i;throw o>3?e===0||e===BigInt(0)?i=`>= 0${t} and < 2${t} ** ${(o+1)*8}${t}`:i=`>= -(2${t} ** ${(o+1)*8-1}${t}) and < 2 ** ${(o+1)*8-1}${t}`:i=`>= ${e}${t} and <= ${r}${t}`,new xe.ERR_OUT_OF_RANGE("value",i,a)}jo(s,n,o)}function Be(a,e){if(typeof a!="number")throw new xe.ERR_INVALID_ARG_TYPE(e,"number",a)}function Ke(a,e,r){throw Math.floor(a)!==a?(Be(a,r),new xe.ERR_OUT_OF_RANGE(r||"offset","an integer",a)):e<0?new xe.ERR_BUFFER_OUT_OF_BOUNDS:new xe.ERR_OUT_OF_RANGE(r||"offset",`>= ${r?1:0} and <= ${e}`,a)}var Oo=/[^+/0-9A-Za-z-_]/g;function Ko(a){if(a=a.split("=")[0],a=a.trim().replace(Oo,""),a.length<2)return"";for(;a.length%4!==0;)a=a+"=";return a}function $a(a,e){e=e||1/0;let r,s=a.length,n=null,o=[];for(let t=0;t<s;++t){if(r=a.charCodeAt(t),r>55295&&r<57344){if(!n){if(r>56319){(e-=3)>-1&&o.push(239,191,189);continue}else if(t+1===s){(e-=3)>-1&&o.push(239,191,189);continue}n=r;continue}if(r<56320){(e-=3)>-1&&o.push(239,191,189),n=r;continue}r=(n-55296<<10|r-56320)+65536}else n&&(e-=3)>-1&&o.push(239,191,189);if(n=null,r<128){if((e-=1)<0)break;o.push(r)}else if(r<2048){if((e-=2)<0)break;o.push(r>>6|192,r&63|128)}else if(r<65536){if((e-=3)<0)break;o.push(r>>12|224,r>>6&63|128,r&63|128)}else if(r<1114112){if((e-=4)<0)break;o.push(r>>18|240,r>>12&63|128,r>>6&63|128,r&63|128)}else throw new Error("Invalid code point")}return o}function No(a){let e=[];for(let r=0;r<a.length;++r)e.push(a.charCodeAt(r)&255);return e}function Vo(a,e){let r,s,n,o=[];for(let t=0;t<a.length&&!((e-=2)<0);++t)r=a.charCodeAt(t),s=r>>8,n=r%256,o.push(n),o.push(s);return o}function es(a){return Va.toByteArray(Ko(a))}function na(a,e,r,s){let n;for(n=0;n<s&&!(n+r>=e.length||n>=a.length);++n)e[n+r]=a[n];return n}function Y(a,e){return a instanceof e||a!=null&&a.constructor!=null&&a.constructor.name!=null&&a.constructor.name===e.name}function Za(a){return a!==a}var zo=(function(){let a="0123456789abcdef",e=new Array(256);for(let r=0;r<16;++r){let s=r*16;for(let n=0;n<16;++n)e[s+n]=a[r]+a[n]}return e})();function ne(a){return typeof BigInt>"u"?Wo:a}function Wo(){throw new Error("BigInt not supported")}});var as,f=uo(()=>{"use strict";as=Oa(oa(),1);globalThis.Buffer??=as.Buffer});f();var Ir=Oa(oa(),1);f();f();function be(){throw new Error("Not available in the browser")}var rs=be;var ss=be,Qa=be,ns=be,os=be,ts=be,ps=()=>be;f();function Ge(...a){return a.filter(Boolean).join("/").replace(/\/+/g,"/")}function $o(a){let e=a.lastIndexOf("/");return e<=0?"/":a.slice(0,e)}function qo(...a){return Ge(...a)}function Xo(a){return a.slice(a.lastIndexOf("/")+1)}var N={join:Ge,dirname:$o,resolve:qo,basename:Xo};f();f();var Ne=Oa(oa(),1),Jo=new Uint32Array([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),ee=(a,e)=>a>>>e|a<<32-e,Ya=(a,e)=>a<<e|a>>>32-e;function is(a){let e=Math.ceil((a.length+9)/64)*64,r=new Uint8Array(e);r.set(a),r[a.length]=128;let s=new DataView(r.buffer),n=a.length*8;return s.setUint32(e-8,Math.floor(n/4294967296)),s.setUint32(e-4,n>>>0),s}function Zo(a){let e=is(a),r=new Uint32Array([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]),s=new Uint32Array(64);for(let o=0;o<e.byteLength;o+=64){for(let y=0;y<16;y++)s[y]=e.getUint32(o+y*4);for(let y=16;y<64;y++){let b=ee(s[y-15],7)^ee(s[y-15],18)^s[y-15]>>>3,v=ee(s[y-2],17)^ee(s[y-2],19)^s[y-2]>>>10;s[y]=s[y-16]+b+s[y-7]+v>>>0}let[t,i,p,m,c,l,u,d]=r;for(let y=0;y<64;y++){let b=ee(c,6)^ee(c,11)^ee(c,25),v=c&l^~c&u,_=d+b+v+Jo[y]+s[y]>>>0,w=ee(t,2)^ee(t,13)^ee(t,22),E=t&i^t&p^i&p,g=w+E>>>0;d=u,u=l,l=c,c=m+_>>>0,m=p,p=i,i=t,t=_+g>>>0}[t,i,p,m,c,l,u,d].forEach((y,b)=>r[b]=r[b]+y>>>0)}let n=new DataView(new ArrayBuffer(32));return r.forEach((o,t)=>n.setUint32(t*4,o)),new Uint8Array(n.buffer)}function Qo(a){let e=is(a),r=new Uint32Array([1732584193,4023233417,2562383102,271733878,3285377520]),s=new Uint32Array(80);for(let o=0;o<e.byteLength;o+=64){for(let l=0;l<16;l++)s[l]=e.getUint32(o+l*4);for(let l=16;l<80;l++)s[l]=Ya(s[l-3]^s[l-8]^s[l-14]^s[l-16],1);let[t,i,p,m,c]=r;for(let l=0;l<80;l++){let[u,d]=l<20?[i&p|~i&m,1518500249]:l<40?[i^p^m,1859775393]:l<60?[i&p|i&m|p&m,2400959708]:[i^p^m,3395469782],y=Ya(t,5)+u+c+d+s[l]>>>0;c=m,m=p,p=Ya(i,30)>>>0,i=t,t=y}[t,i,p,m,c].forEach((l,u)=>r[u]=r[u]+l>>>0)}let n=new DataView(new ArrayBuffer(20));return r.forEach((o,t)=>n.setUint32(t*4,o)),new Uint8Array(n.buffer)}var er=class{constructor(e){this.algorithm=e}parts=[];update(e,r){return this.parts.push(typeof e=="string"?Ne.Buffer.from(e,r??"utf8"):Ne.Buffer.from(e)),this}digest(e){let r=Ne.Buffer.concat(this.parts),s=Ne.Buffer.from(this.algorithm==="sha1"?Qo(r):Zo(r));return e?s.toString(e):s}};function Te(a){if(a!=="sha1"&&a!=="sha256")throw new Error(`The browser build only has sha1 and sha256, not ${a}`);return new er(a)}f();var ae=new Uint8Array(256),Ce=new Uint8Array(256),ms=[0,1,2,3].map(()=>new Uint32Array(256)),cs=[0,1,2,3].map(()=>new Uint32Array(256));function oe(a,e){let r=0;for(;e;e>>=1)e&1&&(r^=a),a=a<<1^(a&128?283:0);return r}var ls=a=>(a>>>8|a<<24)>>>0;for(let a=0;a<256;a++){let e=0;if(a)for(e=1;oe(a,e)!==1;e++);let r=e;for(let s=1;s<=4;s++)r^=(e<<s|e>>8-s)&255;r^=99,ae[a]=r,Ce[r]=a}for(let a=0;a<256;a++){let e=ae[a],r=Ce[a],s=(oe(e,2)<<24|e<<16|e<<8|oe(e,3))>>>0,n=(oe(r,14)<<24|oe(r,9)<<16|oe(r,13)<<8|oe(r,11))>>>0;for(let o=0;o<4;o++)ms[o][a]=s,cs[o][a]=n,s=ls(s),n=ls(n)}var[vl,Bl,El,Gl]=ms,[Ve,ze,We,$e]=cs;function Yo(a){if(a.length!==16)throw new Error("AES-128 needs a 16-byte key");let e=new Uint32Array(44);for(let s=0;s<4;s++)e[s]=(a[4*s]<<24|a[4*s+1]<<16|a[4*s+2]<<8|a[4*s+3])>>>0;let r=1;for(let s=4;s<44;s++){let n=e[s-1];s%4===0&&(n=(ae[n>>>16&255]<<24|ae[n>>>8&255]<<16|ae[n&255]<<8|ae[n>>>24])^r<<24,r=oe(r,2)),e[s]=(e[s-4]^n)>>>0}return e}function et(a){let e=new Uint32Array(44);for(let r=0;r<=10;r++)for(let s=0;s<4;s++){let n=a[(10-r)*4+s];e[r*4+s]=r===0||r===10?n:(Ve[ae[n>>>24]]^ze[ae[n>>>16&255]]^We[ae[n>>>8&255]]^$e[ae[n&255]])>>>0}return e}var ta=(a,e)=>(a[e]<<24|a[e+1]<<16|a[e+2]<<8|a[e+3])>>>0;function pa(a,e,r){a[e]=r>>>24,a[e+1]=r>>>16,a[e+2]=r>>>8,a[e+3]=r}function at(a){if(a.length%16!==0)throw new Error("AES-CBC data must be whole 16-byte blocks")}function ia(a,e){at(e);let r=et(Yo(a)),s=new Uint8Array(e.length),[n,o,t,i]=[0,0,0,0];for(let p=0;p<e.length;p+=16){let m=ta(e,p),c=ta(e,p+4),l=ta(e,p+8),u=ta(e,p+12),d=(m^r[0])>>>0,y=(c^r[1])>>>0,b=(l^r[2])>>>0,v=(u^r[3])>>>0;for(let w=1;w<10;w++){let E=Ve[d>>>24]^ze[v>>>16&255]^We[b>>>8&255]^$e[y&255]^r[4*w],g=Ve[y>>>24]^ze[d>>>16&255]^We[v>>>8&255]^$e[b&255]^r[4*w+1],B=Ve[b>>>24]^ze[y>>>16&255]^We[d>>>8&255]^$e[v&255]^r[4*w+2],G=Ve[v>>>24]^ze[b>>>16&255]^We[y>>>8&255]^$e[d&255]^r[4*w+3];[d,y,b,v]=[E>>>0,g>>>0,B>>>0,G>>>0]}let _=(w,E,g,B,G)=>((Ce[w>>>24]<<24|Ce[E>>>16&255]<<16|Ce[g>>>8&255]<<8|Ce[B&255])^G)>>>0;pa(s,p,_(d,v,b,y,r[40])^n),pa(s,p+4,_(y,d,v,b,r[41])^o),pa(s,p+8,_(b,y,d,v,r[42])^t),pa(s,p+12,_(v,b,y,d,r[43])^i),[n,o,t,i]=[m,c,l,u]}return s}var re=class extends Error{},rt=ca("98c940975c1d10e87fe60ea3fd03a8ba"),Re=93,st=ca("115a5d20d53a8dd39cc5af410f0f186f"),nt=new Map([[2147810563,"f4aef4e186ddd29c7cc542a695a08388"],[3642099184,"b88c458bb6e76eb85159a6537c5e8631"],[3642099440,"ed10e036c4fe83f375705ef6a44005f7"],[3642099952,"5c770cbbb4c24fa27e3b4eb4b4c870af"],[3642100208,"d036127580562043c430943e1c75d1bf"],[3642100464,"10a9ac16ae19c07e3b607786016ff263"],[3642100720,"8383f13753d0befc8da73252460ac2c2"],[3642102256,"61b0c0587157d9fa74670e5c7e6e95b9"],[3642102512,"9e20e1cdd788dec0319b10afc5b87323"],[3642102768,"ebff40d8b41ae166913b8f64b6fcb712"],[3642103024,"fdf7b73c9fd1339511b8b5bb54237385"],[3642103280,"c803e34450f1e72a6a0dc361b68e5f51"],[3642103536,"5303b86a101998491caf30e4251b6b28"],[3642103792,"02fa487375afae0a67892b954b0987a3"],[3642104048,"96967cc3f712da621bf69a9a4444bc48"],[3642104304,"e032a7086b2b292cd14d5beea8c8b4e9"],[3642104560,"27e5a74952e194673566910ce89a2524"],[3642106096,"521cb45f403b9addacfcea92fdddf590"],[3642106352,"d1912ea621142962f6edaecbdda3bafe"],[3642106608,"595d784d21b201176c9ab51bdab7f9e6"],[3642106864,"aa45eb4f62fbd10d71d562d2f5bfa52f"],[3642107120,"61b726af8bf14158836ac49212cbb1e9"],[3642108144,"49a4fc66dce76221db18a750d6a8c1b6"]].map(([a,e])=>[a,ca(e)])),ot=new Map([[3234535036,ca("fa368eda4774d95d7498c176af7ee597bd09ab1cc6ba35988192d303cf05b20334e7822863f614e775276eb9c7af8abd29ecd31d6ca1a4ec87ec695f921e988521aefc7c16dde9ba0478a9e6fc02ee2e3d8adf61640531dd49e197963b3f45c256841df9c86bda39f5fee5b3a393c589bc8a5cfb12720b6ccbd30de1a8b2d0984718d65f5723dcf06a160177683b5c0f")]]),tt=[126,80,83,80],ma=336,la=144,ds=ma-la-128;function ca(a){return Uint8Array.from(a.match(/../g),e=>parseInt(e,16))}var ar=(a,e)=>new DataView(a.buffer,a.byteOffset).getUint32(e,!0);function qe(a,e){if(e!==Re)throw new re(`No key-vault key 0x${e.toString(16)}`);return ia(st,a)}function pt(a,e){let r=new Uint8Array(144);for(let s=0;s<144;s+=16)r.set(a,s),r[s]=s/16;return qe(r,e)}function fs(...a){let e=Te("sha1");for(let r of a)e.update(r);return new Uint8Array(e.digest())}var it=(a,e)=>a.length===e.length&&a.every((r,s)=>r===e[s]);function lt(a){return a.length>=4&&tt.every((e,r)=>a[r]===e)}var mt=a=>`0x${a.toString(16).padStart(8,"0")}`;function hs(a,e){if(!it(a,e))throw new re("The EBOOT's header check failed: wrong key or a damaged file")}function ct(a,e){if(a.subarray(212,300).some(p=>p!==0))throw new re("Not a game EBOOT (its signature-check area isn't empty)");let r=pt(e,Re),s=new Uint8Array(ma);s.set(a.subarray(208,212),0),s.set(a.subarray(320,336),92),s.set(a.subarray(300,320),108),s.set(a.subarray(128,176),128),s.set(a.subarray(192,208),176),s.set(a.subarray(176,192),192),s.set(a.subarray(0,128),208),s.set(qe(s.subarray(92,188),Re),92);let n=s.subarray(128,192),o=s.subarray(192,208),t=s.subarray(208,336);hs(fs(s.subarray(0,4),r.subarray(0,16),s.subarray(4,92),s.subarray(92,108),n,o,t),s.subarray(108,128));let i=new Uint8Array(la);for(let p=0;p<64;p++)i[p]=n[p]^r[16+p];i.set(qe(i.subarray(0,64),Re));for(let p=0;p<64;p++)i[p]^=r[80+p];return i.set(o,112),{header:i,moduleHead:t}}function us(a,e,r){let s=new Uint8Array(ma);s.set(a.subarray(208,232),0),s.set(a.subarray(232,272),24),s.set(a.subarray(272,336),64),s.set(a.subarray(128,208),128),s.set(a.subarray(0,128),208),r===1&&s.set(qe(s.subarray(16,176),Re),16);let n=s.subarray(64,208),o=s.subarray(208,336);hs(fs(e.subarray(0,20),s.subarray(24,64),n,o),s.subarray(4,24));let t=n.slice();for(let i=0;i<112;i++)t[i]=n[i]^e[20+i];t.set(qe(t.subarray(0,112),Re));for(let i=0;i<112;i++)t[i]^=e[32+i];return{header:t,moduleHead:o}}function ys(a,{header:e,moduleHead:r}){let s=ar(e,112),n=ar(e,116),o=ds+la+n,t=s+15&-16;if(o+t>a.length)throw new re("The EBOOT is shorter than its header says");let i=Uint8Array.from(a.subarray(0,o+t));i.set(r,ds+la);let p=ia(rt,e.subarray(0,32)).subarray(0,16),m=ia(p,i.subarray(o,o+t)),c=new DataView(a.buffer,a.byteOffset).getInt32(176,!0);if(c<=0||c>m.length)throw new re("The EBOOT's decrypted size is out of range");return m.subarray(0,c)}function dt(a){return ut(a).data}function ut(a){if(!lt(a)||a.length<ma)throw new re("Not a PSP module (no ~PSP header)");let e=ar(a,208),r=nt.get(e);if(r)return{data:ys(a,ct(a,r)),type:2};let s=ot.get(e);if(!s)throw new re(`Unknown EBOOT tag ${mt(e)}`);let n,o=0;try{n=us(a,s,0)}catch{o=1,n=us(a,s,1)}return{data:ys(a,n),type:o}}var yt=[127,69,76,70];async function ft(a){let e=new Blob([a.slice()]).stream().pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(e).arrayBuffer())}async function bs(a){let e=dt(a);if(e[0]===31&&e[1]===139&&(e=await ft(e)),!yt.every((r,s)=>e[s]===r))throw new re("The decrypted EBOOT isn't an ELF");return e}var ht=ps(rs),bt=Buffer.from([127,69,76,70]),gt=Buffer.from([126,80,83,80]),te=class extends Error{};function gs(a){return a.length>=4&&a.subarray(0,4).equals(bt)}function _s(a,e){if(!gs(a))throw new te(`${e} does not look like a decrypted ELF (expected magic 7f454c46, got ${a.subarray(0,4).toString("hex")})`)}function _t(a){return typeof a=="object"&&a!==null&&"code"in a}async function da(a,e={}){if(e.overridePath){let s=await Qa(e.overridePath);return _s(s,`--eboot override at ${e.overridePath}`),s}if(gs(a))return a;if(a.length<4||!a.subarray(0,4).equals(gt))throw new te(`EBOOT.BIN has unrecognized magic ${a.subarray(0,4).toString("hex")} \u2014 expected "~PSP" (KIRK-encrypted) or an ELF header.`);let r;try{return Buffer.from(await bs(a))}catch(s){r=s}if(e.external===!1)throw new te(`Couldn't decrypt EBOOT.BIN: ${r instanceof Error?r.message:r}`);return wt(a,e.pspdecryptBin??"pspdecrypt")}async function wt(a,e){let r=await ss(Ge(ts(),"mhfu-extract-eboot-")),s=Ge(r,"EBOOT.BIN"),n=Ge(r,"EBOOT.dec");try{await ns(s,a),await ht(e,["-o",n,s]);let o=await Qa(n);return _s(o,`${e} output`),o}catch(o){throw o instanceof te?o:_t(o)&&o.code==="ENOENT"?new te(`EBOOT.BIN is KIRK-encrypted and no decryption path succeeded: "${e}" was not found on PATH.
Either build pspdecrypt (GPL-3.0, https://github.com/John-K/pspdecrypt) and put it on PATH, or pass --eboot <path> pointing at a pre-decrypted dump (e.g. via PPSSPP's Debug -> Dump Decrypted EBOOT.BIN). See README.`):new te(`"${e}" failed to decrypt EBOOT.BIN: ${o instanceof Error?o.message:o}`)}finally{await os(r,{recursive:!0,force:!0})}}f();function ws(a,e,r){let s=a.readUInt8(e);if(s===0)return null;let n=a.readUInt32LE(e+2),o=a.readUInt32LE(e+10),i=(a.readUInt8(e+25)&2)!==0,p=a.readUInt8(e+32),m=a.toString("latin1",e+33,e+33+p),c=m.indexOf(";");return c!==-1&&(m=m.slice(0,c)),{entry:{name:m,isDirectory:i,lba:n,size:o,recordOffset:r+e},recordLength:s}}var Me=class{constructor(e){this.source=e;let r=this.readSector(16);if(r.readUInt8(0)!==1||r.toString("latin1",1,6)!=="CD001")throw new Error("Not an ISO 9660 image (bad primary volume descriptor)");let n=ws(r,156,16*2048);if(!n)throw new Error("Missing root directory record in PVD");this.rootEntry=n.entry}rootEntry;readSector(e){return this.source.read(e*2048,2048)}readDirectory(e){let r=Math.ceil(e.size/2048),s=this.source.read(e.lba*2048,r*2048),n=[];for(let o=0;o<r;o++){let t=o*2048,i=t+2048;for(;t<i;){let p=ws(s,t,e.lba*2048);if(!p)break;p.entry.name.length>0&&n.push(p.entry),t+=p.recordLength}}return n}listRoot(){return this.readDirectory(this.rootEntry)}stat(e){let r=e.split("/").filter(Boolean),s=this.rootEntry,n=this.readDirectory(s);for(let[o,t]of r.entries()){let i=n.find(p=>p.name.toUpperCase()===t.toUpperCase());if(!i)throw new Error(`Path not found in ISO: ${e} (missing segment "${t}")`);if(s=i,o<r.length-1){if(!s.isDirectory)throw new Error(`Path segment "${t}" in ${e} is not a directory`);n=this.readDirectory(s)}}return s}readFile(e){let r=this.stat(e);if(r.isDirectory)throw new Error(`${e} is a directory, not a file`);return this.source.read(r.lba*2048,r.size)}};f();function ua(a){if(a.readUInt32LE(0)!==1179865088)throw new Error("Not a PARAM.SFO file (bad magic)");let e=a.readUInt32LE(8),r=a.readUInt32LE(12),s=a.readUInt32LE(16),n=new Map;for(let o=0;o<s;o++){let t=20+o*16,i=a.readUInt16LE(t),p=a.readUInt16LE(t+2),m=a.readUInt32LE(t+4),c=a.readUInt32LE(t+8),l=a.readUInt32LE(t+12),u=e+i,d=u;for(;a[d]!==0;)d++;let y=a.toString("latin1",u,d),b=r+l;if(p===1028)n.set(y,a.readUInt32LE(b));else{let v=p===516?Math.max(m,c):m,_=a.toString("utf8",b,b+v),w=_.indexOf("\0");w!==-1&&(_=_.slice(0,w)),n.set(y,_)}}return n}var St={ULJM05500:"jp",ULUS10391:"us",ULES01213:"eu"};function ya(a){let e=a.get("DISC_ID");return typeof e!="string"?{region:null,discId:null}:{region:St[e]??null,discId:e}}f();var C=2048,kt=16*C,xt=80,vt=2,Bt=10,fa=class{constructor(e){this.base=e;this.size=e.totalBytes}sectors=new Map;size;get totalBytes(){return this.size}baseSector(e){let r=Buffer.alloc(C),s=e*C,n=Math.min(s+C,this.base.totalBytes);return n>s&&this.base.read(s,n-s).copy(r),r}read(e,r){if(e<0||e+r>this.size)throw new RangeError(`OverlaySource: read past the end at 0x${e.toString(16)}`);let s=Buffer.alloc(r),n=0;for(;n<r;){let o=e+n,t=Math.floor(o/C),i=this.sectors.get(t);if(i){let l=o-t*C,u=Math.min(C-l,r-n);i.copy(s,n,l,l+u),n+=u;continue}let p=(t+1)*C;for(;p<e+r&&!this.sectors.has(p/C);)p+=C;let m=Math.min(p,e+r)-o,c=Math.min(m,Math.max(0,this.base.totalBytes-o));c>0&&this.base.read(o,c).copy(s,n),n+=m}return s}write(e,r){let s=0;for(;s<r.length;){let n=e+s,o=Math.floor(n/C),t=this.sectors.get(o);t||(t=this.baseSector(o),this.sectors.set(o,t));let i=n-o*C,p=Math.min(C-i,r.length-s);r.copy(t,i,s,s+p),s+=p}this.size=Math.max(this.size,e+r.length)}truncate(e){this.size=e;for(let r of[...this.sectors.keys()])r*C>=e&&this.sectors.delete(r)}segments(){let e=[],r=Math.ceil(this.size/C),s=0;for(;s<r;){let n=s*C;if(this.sectors.has(s)){let o=[];for(;s<r&&this.sectors.has(s);)o.push(this.sectors.get(s++));let t=Buffer.concat(o);e.push({kind:"data",data:t.subarray(0,Math.min(t.length,this.size-n))})}else{for(;s<r&&!this.sectors.has(s);)s++;let o=Math.min(s*C,this.size),t=Math.min(o,this.base.totalBytes);t>n&&e.push({kind:"original",start:n,end:t}),o>Math.max(n,t)&&e.push({kind:"data",data:Buffer.alloc(o-Math.max(n,t))})}}return e}get changedSectors(){return this.sectors.size}close(){this.base.close()}};function rr(a,e,r){a.writeUInt32LE(r,e),a.writeUInt32BE(r,e+4)}var ha=class{constructor(e){this.file=e;this.iso=new Me(e)}iso;get source(){return this.file}stat(e){return this.iso.stat(e)}writeInFile(e,r,s){if(r<0||r+s.length>e.size)throw new RangeError(`write of ${s.length} bytes at 0x${r.toString(16)} is outside ${e.name} (${e.size} bytes)`);this.file.write(e.lba*C+r,s)}replaceFile(e,r){let s=this.stat(e);if(s.isDirectory)throw new Error(`${e} is a directory`);let n=Math.ceil(s.size/C)*C,o=Buffer.alloc(Math.ceil(r.length/C)*C);r.copy(o);let t=s.lba,i=!1;if(r.length<=n){let m=Buffer.alloc(n);r.copy(m),this.file.write(s.lba*C,m)}else{let m=Math.ceil(this.file.totalBytes/C)*C;t=m/C,this.file.write(m,o),i=!0,this.setVolumeSize((m+o.length)/C)}let p=this.file.read(s.recordOffset,18);return rr(p,vt,t),rr(p,Bt,r.length),this.file.write(s.recordOffset,p),{path:e,moved:i,lba:t,size:r.length}}setVolumeSize(e){let r=Buffer.alloc(8);rr(r,0,e),this.file.write(kt+xt,r),this.file.truncate(e*C)}close(){this.file.close()}};f();f();f();var Ss=`0000,system/dummy
0001,system/padding00
0002,system/padding01
0003,system/padding02
0004,system/padding03
0005,system/padding04
0006,system/padding05
0007,system/padding06
0008,system/padding07
0009,system/padding08
0010,system/padding09
0011,system/padding10
0012,icon/ICON0.PNG
0013,icon/PIC1.PNG
0014,icon/ICON0_MI.PNG
0015,message_jpn/str_tbl.pac
0016,system/connect.tmh
0017,system/demo.tmh
0018,system/resides.tmh
0019,system/arcade.tmh
0020,system/gallery.tmh
0021,system/neko.tmh
0022,module/libfont.prx
0023,module/libbase64.prx
0024,browser/bs_skin.gim
0025,browser/loading.gim
0026,movie/title_loop.pmf
0027,movie/title_loop_g.pmf
0028,movie/game_opening_man.pmf
0029,movie/game_opening_woman.pmf
0030,movie/endroll.pmf
0031,movie/show_g.pmf
0032,movie/utahime.pmf
0033,movie/yadokari.pmf
0034,movie/gorilion.pmf
0035,movie/female_wyvern.pmf
0036,movie/furufuru.pmf
0037,movie/fish_wyvern.pmf
0038,movie/tsuno_wyvern.pmf
0039,movie/armor_wyvern.pmf
0040,movie/metal_dragon.pmf
0041,movie/wyvern_rex.pmf
0042,movie/wyvern_arex.pmf
0043,overlay/demo_task.ovl
0044,overlay/edit_task.ovl
0045,overlay/cont_task.ovl
0046,overlay/option_task.ovl
0047,overlay/gallery_task.ovl
0048,overlay/download_task.ovl
0049,overlay/install_task.ovl
0050,overlay/lobby_task.ovl
0051,overlay/game_task.ovl
0052,overlay/show_select_task.ovl
0053,overlay/arcade_task.ovl
0054,overlay/movie_task.ovl
0055,overlay/demo_sub.ovl
0056,overlay/game_sub.ovl
0057,edit/editpl_f.pac
0058,edit/editpl_m.pac
0059,cockpit/guild.tmh
0060,cockpit/stgicon.tmh
0061,motion/plcom_tbl.bin
0062,player/f/reg/f_reg000.pac
0063,player/f/reg/f_reg001.pac
0064,player/f/reg/f_reg002.pac
0065,player/f/reg/f_reg003.pac
0066,player/f/reg/f_reg004.pac
0067,player/f/reg/f_reg005.pac
0068,player/f/reg/f_reg006.pac
0069,player/f/reg/f_reg007.pac
0070,player/f/reg/f_reg008.pac
0071,player/f/reg/f_reg009.pac
0072,player/f/reg/f_reg010.pac
0073,player/f/reg/f_reg011.pac
0074,player/f/reg/f_reg012.pac
0075,player/f/reg/f_reg013.pac
0076,player/f/reg/f_reg014.pac
0077,player/f/reg/f_reg015.pac
0078,player/f/reg/f_reg016.pac
0079,player/f/reg/f_reg017.pac
0080,player/f/reg/f_reg018.pac
0081,player/f/reg/f_reg019.pac
0082,player/f/reg/f_reg020.pac
0083,player/f/reg/f_reg021.pac
0084,player/f/reg/f_reg022.pac
0085,player/f/reg/f_reg023.pac
0086,player/f/reg/f_reg024.pac
0087,player/f/reg/f_reg025.pac
0088,player/f/reg/f_reg026.pac
0089,player/f/reg/f_reg027.pac
0090,player/f/reg/f_reg028.pac
0091,player/f/reg/f_reg029.pac
0092,player/f/reg/f_reg030.pac
0093,player/f/reg/f_reg031.pac
0094,player/f/reg/f_reg032.pac
0095,player/f/reg/f_reg033.pac
0096,player/f/reg/f_reg034.pac
0097,player/f/reg/f_reg035.pac
0098,player/f/reg/f_reg036.pac
0099,player/f/reg/f_reg037.pac
0100,player/f/reg/f_reg038.pac
0101,player/f/reg/f_reg039.pac
0102,player/f/reg/f_reg040.pac
0103,player/f/reg/f_reg041.pac
0104,player/f/reg/f_reg042.pac
0105,player/f/reg/f_reg043.pac
0106,player/f/reg/f_reg044.pac
0107,player/f/reg/f_reg045.pac
0108,player/f/reg/f_reg046.pac
0109,player/f/reg/f_reg047.pac
0110,player/f/reg/f_reg048.pac
0111,player/f/reg/f_reg049.pac
0112,player/f/reg/f_reg050.pac
0113,player/f/reg/f_reg051.pac
0114,player/f/reg/f_reg052.pac
0115,player/f/reg/f_reg053.pac
0116,player/f/reg/f_reg054.pac
0117,player/f/reg/f_reg055.pac
0118,player/f/reg/f_reg056.pac
0119,player/f/reg/f_reg057.pac
0120,player/f/reg/f_reg058.pac
0121,player/f/reg/f_reg059.pac
0122,player/f/reg/f_reg060.pac
0123,player/f/reg/f_reg061.pac
0124,player/f/reg/f_reg062.pac
0125,player/f/reg/f_reg063.pac
0126,player/f/reg/f_reg064.pac
0127,player/f/reg/f_reg065.pac
0128,player/f/reg/f_reg066.pac
0129,player/f/reg/f_reg067.pac
0130,player/f/reg/f_reg068.pac
0131,player/f/reg/f_reg069.pac
0132,player/f/reg/f_reg070.pac
0133,player/f/reg/f_reg071.pac
0134,player/f/reg/f_reg072.pac
0135,player/f/reg/f_reg073.pac
0136,player/f/reg/f_reg074.pac
0137,player/f/reg/f_reg075.pac
0138,player/f/reg/f_reg076.pac
0139,player/f/reg/f_reg077.pac
0140,player/f/reg/f_reg078.pac
0141,player/f/reg/f_reg079.pac
0142,player/f/reg/f_reg080.pac
0143,player/f/reg/f_reg081.pac
0144,player/f/reg/f_reg082.pac
0145,player/f/reg/f_reg083.pac
0146,player/f/reg/f_reg084.pac
0147,player/f/reg/f_reg085.pac
0148,player/f/reg/f_reg086.pac
0149,player/f/reg/f_reg087.pac
0150,player/f/reg/f_reg088.pac
0151,player/f/reg/f_reg089.pac
0152,player/f/reg/f_reg090.pac
0153,player/f/reg/f_reg091.pac
0154,player/f/reg/f_reg092.pac
0155,player/f/reg/f_reg093.pac
0156,player/f/reg/f_reg094.pac
0157,player/f/reg/f_reg095.pac
0158,player/f/reg/f_reg096.pac
0159,player/f/reg/f_reg097.pac
0160,player/f/reg/f_reg098.pac
0161,player/f/reg/f_reg099.pac
0162,player/f/reg/f_reg100.pac
0163,player/f/reg/f_reg101.pac
0164,player/f/reg/f_reg102.pac
0165,player/f/reg/f_reg103.pac
0166,player/f/reg/f_reg104.pac
0167,player/f/reg/f_reg105.pac
0168,player/f/reg/f_reg106.pac
0169,player/f/reg/f_reg107.pac
0170,player/f/reg/f_reg108.pac
0171,player/f/reg/f_reg109.pac
0172,player/f/reg/f_reg110.pac
0173,player/f/reg/f_reg111.pac
0174,player/f/reg/f_reg112.pac
0175,player/f/reg/f_reg113.pac
0176,player/f/reg/f_reg114.pac
0177,player/f/reg/f_reg115.pac
0178,player/f/reg/f_reg116.pac
0179,player/f/reg/f_reg117.pac
0180,player/f/reg/f_reg118.pac
0181,player/f/reg/f_reg119.pac
0182,player/f/reg/f_reg120.pac
0183,player/f/reg/f_reg121.pac
0184,player/f/reg/f_reg122.pac
0185,player/f/reg/f_reg123.pac
0186,player/f/reg/f_reg124.pac
0187,player/f/reg/f_reg125.pac
0188,player/f/reg/f_reg126.pac
0189,player/f/reg/f_reg127.pac
0190,player/f/reg/f_reg128.pac
0191,player/f/reg/f_reg129.pac
0192,player/f/reg/f_reg130.pac
0193,player/f/reg/f_reg131.pac
0194,player/f/reg/f_reg132.pac
0195,player/f/reg/f_reg133.pac
0196,player/f/reg/f_reg134.pac
0197,player/f/reg/f_reg135.pac
0198,player/f/reg/f_reg136.pac
0199,player/f/reg/f_reg137.pac
0200,player/f/reg/f_reg138.pac
0201,player/f/reg/f_reg139.pac
0202,player/f/reg/f_reg140.pac
0203,player/f/reg/f_reg141.pac
0204,player/f/reg/f_reg142.pac
0205,player/f/reg/f_reg143.pac
0206,player/f/reg/f_reg144.pac
0207,player/f/reg/f_reg145.pac
0208,player/f/reg/f_reg146.pac
0209,player/f/reg/f_reg147.pac
0210,player/f/reg/f_reg148.pac
0211,player/f/reg/f_reg149.pac
0212,player/f/reg/f_reg150.pac
0213,player/f/reg/f_reg151.pac
0214,player/f/reg/f_reg152.pac
0215,player/f/reg/f_reg153.pac
0216,player/f/reg/f_reg154.pac
0217,player/f/reg/f_reg155.pac
0218,player/f/reg/f_reg156.pac
0219,player/f/reg/f_reg157.pac
0220,player/f/reg/f_reg158.pac
0221,player/f/reg/f_reg159.pac
0222,player/f/reg/f_reg160.pac
0223,player/f/reg/f_reg161.pac
0224,player/f/reg/f_reg162.pac
0225,player/f/reg/f_reg163.pac
0226,player/f/reg/f_reg164.pac
0227,player/f/reg/f_reg165.pac
0228,player/f/reg/f_reg166.pac
0229,player/f/reg/f_reg167.pac
0230,player/f/reg/f_reg168.pac
0231,player/f/reg/f_reg169.pac
0232,player/f/reg/f_reg170.pac
0233,player/f/reg/f_reg171.pac
0234,player/f/reg/f_reg172.pac
0235,player/f/reg/f_reg173.pac
0236,player/f/reg/f_reg174.pac
0237,player/f/reg/f_reg175.pac
0238,player/f/reg/f_reg176.pac
0239,player/f/reg/f_reg177.pac
0240,player/f/reg/f_reg178.pac
0241,player/f/reg/f_reg179.pac
0242,player/f/reg/f_reg180.pac
0243,player/f/reg/f_reg181.pac
0244,player/f/reg/f_reg182.pac
0245,player/f/reg/f_reg183.pac
0246,player/f/reg/f_reg184.pac
0247,player/f/reg/f_reg185.pac
0248,player/f/reg/f_reg186.pac
0249,player/f/reg/f_reg187.pac
0250,player/f/reg/f_reg188.pac
0251,player/f/reg/f_reg189.pac
0252,player/f/reg/f_reg190.pac
0253,player/f/reg/f_reg191.pac
0254,player/f/reg/f_reg192.pac
0255,player/f/reg/f_reg193.pac
0256,player/f/reg/f_reg194.pac
0257,player/f/reg/f_reg195.pac
0258,player/f/reg/f_reg196.pac
0259,player/f/reg/f_reg197.pac
0260,player/f/reg/f_reg198.pac
0261,player/f/reg/f_reg199.pac
0262,player/f/reg/f_reg200.pac
0263,player/f/reg/f_reg201.pac
0264,player/f/reg/f_reg202.pac
0265,player/f/reg/f_reg203.pac
0266,player/f/reg/f_reg204.pac
0267,player/f/reg/f_reg205.pac
0268,player/f/reg/f_reg206.pac
0269,player/f/reg/f_reg207.pac
0270,player/f/reg/f_reg208.pac
0271,player/f/reg/f_reg209.pac
0272,player/f/reg/f_reg210.pac
0273,player/f/reg/f_reg211.pac
0274,player/f/reg/f_reg212.pac
0275,player/f/reg/f_reg213.pac
0276,player/f/reg/f_reg214.pac
0277,player/f/reg/f_reg215.pac
0278,player/f/reg/f_reg216.pac
0279,player/f/reg/f_reg217.pac
0280,player/f/reg/f_reg218.pac
0281,player/f/reg/f_reg219.pac
0282,player/f/reg/f_reg220.pac
0283,player/f/reg/f_reg221.pac
0284,player/f/reg/f_reg222.pac
0285,player/f/reg/f_reg223.pac
0286,player/f/reg/f_reg224.pac
0287,player/f/reg/f_reg225.pac
0288,player/f/reg/f_reg226.pac
0289,player/f/reg/f_reg227.pac
0290,player/f/reg/f_reg228.pac
0291,player/f/reg/f_reg229.pac
0292,player/f/reg/f_reg230.pac
0293,player/f/reg/f_reg231.pac
0294,player/f/reg/f_reg232.pac
0295,player/f/reg/f_reg233.pac
0296,player/f/reg/f_reg234.pac
0297,player/f/reg/f_reg235.pac
0298,player/f/reg/f_reg236.pac
0299,player/f/reg/f_reg237.pac
0300,player/f/reg/f_reg238.pac
0301,player/f/reg/f_reg239.pac
0302,player/f/reg/f_reg240.pac
0303,player/f/reg/f_reg241.pac
0304,player/f/reg/f_reg242.pac
0305,player/f/reg/f_reg243.pac
0306,player/f/reg/f_reg244.pac
0307,player/f/reg/f_reg245.pac
0308,player/f/reg/f_reg246.pac
0309,player/f/reg/f_reg247.pac
0310,player/f/reg/f_reg248.pac
0311,player/f/reg/f_reg249.pac
0312,player/f/reg/f_reg250.pac
0313,player/f/reg/f_reg251.pac
0314,player/f/reg/f_reg252.pac
0315,player/f/reg/f_reg253.pac
0316,player/f/reg/f_reg254.pac
0317,player/f/reg/f_reg255.pac
0318,player/f/reg/f_reg256.pac
0319,player/f/reg/f_reg257.pac
0320,player/f/reg/f_reg258.pac
0321,player/f/reg/f_reg259.pac
0322,player/f/reg/f_reg260.pac
0323,player/f/reg/f_reg261.pac
0324,player/f/reg/f_reg262.pac
0325,player/f/reg/f_reg263.pac
0326,player/f/reg/f_reg264.pac
0327,player/f/reg/f_reg265.pac
0328,player/f/reg/f_reg266.pac
0329,player/f/reg/f_reg267.pac
0330,player/f/reg/f_reg268.pac
0331,player/f/reg/f_reg269.pac
0332,player/f/reg/f_reg270.pac
0333,player/f/reg/f_reg271.pac
0334,player/f/reg/f_reg272.pac
0335,player/f/reg/f_reg273.pac
0336,player/f/reg/f_reg274.pac
0337,player/f/reg/f_reg275.pac
0338,player/f/reg/f_reg276.pac
0339,player/f/reg/f_reg277.pac
0340,player/f/reg/f_reg278.pac
0341,player/f/reg/f_reg279.pac
0342,player/f/reg/f_reg280.pac
0343,player/f/reg/f_reg281.pac
0344,player/f/reg/f_reg282.pac
0345,player/f/reg/f_reg283.pac
0346,player/f/reg/f_reg284.pac
0347,player/f/reg/f_reg285.pac
0348,player/f/reg/f_reg286.pac
0349,player/f/reg/f_reg287.pac
0350,player/f/reg/f_reg288.pac
0351,player/f/reg/f_reg289.pac
0352,player/f/reg/f_reg290.pac
0353,player/f/reg/f_reg291.pac
0354,player/f/reg/f_reg292.pac
0355,player/f/reg/f_reg293.pac
0356,player/f/reg/f_reg294.pac
0357,player/f/reg/f_reg295.pac
0358,player/f/reg/f_reg296.pac
0359,player/f/reg/f_reg297.pac
0360,player/f/reg/f_reg298.pac
0361,player/f/reg/f_reg299.pac
0362,player/f/reg/f_reg300.pac
0363,player/f/reg/f_reg301.pac
0364,player/f/reg/f_reg302.pac
0365,player/f/reg/f_reg303.pac
0366,player/f/reg/f_reg304.pac
0367,player/f/reg/f_reg305.pac
0368,player/f/reg/f_reg306.pac
0369,player/f/reg/f_reg307.pac
0370,player/f/reg/f_reg308.pac
0371,player/f/reg/f_reg309.pac
0372,player/f/reg/f_reg310.pac
0373,player/f/reg/f_reg311.pac
0374,player/f/face/f_face000.pac
0375,player/f/face/f_face001.pac
0376,player/f/face/f_face002.pac
0377,player/f/face/f_face003.pac
0378,player/f/face/f_face004.pac
0379,player/f/face/f_face005.pac
0380,player/f/face/f_face006.pac
0381,player/f/face/f_face007.pac
0382,player/f/face/f_face008.pac
0383,player/f/face/f_face009.pac
0384,player/f/face/f_face010.pac
0385,player/f/face/f_face011.pac
0386,player/f/face/f_face012.pac
0387,player/f/face/f_face013.pac
0388,player/f/face/f_face014.pac
0389,player/f/face/f_face015.pac
0390,player/f/face/f_face016.pac
0391,player/f/face/f_face017.pac
0392,player/f/face/f_face018.pac
0393,player/f/face/f_face019.pac
0394,player/f/face/f_face020.pac
0395,player/f/face/f_face021.pac
0396,player/f/face/f_face022.pac
0397,player/f/face/f_face023.pac
0398,player/f/face/f_face024.pac
0399,player/f/face/f_face025.pac
0400,player/f/face/f_face026.pac
0401,player/f/face/f_face027.pac
0402,player/f/face/f_face028.pac
0403,player/f/face/f_face029.pac
0404,player/f/face/f_face030.pac
0405,player/f/face/f_face031.pac
0406,player/f/hair/f_hair000.pac
0407,player/f/hair/f_hair001.pac
0408,player/f/hair/f_hair002.pac
0409,player/f/hair/f_hair003.pac
0410,player/f/hair/f_hair004.pac
0411,player/f/hair/f_hair005.pac
0412,player/f/hair/f_hair006.pac
0413,player/f/hair/f_hair007.pac
0414,player/f/hair/f_hair008.pac
0415,player/f/hair/f_hair009.pac
0416,player/f/hair/f_hair010.pac
0417,player/f/hair/f_hair011.pac
0418,player/f/hair/f_hair012.pac
0419,player/f/hair/f_hair013.pac
0420,player/f/hair/f_hair014.pac
0421,player/f/hair/f_hair015.pac
0422,player/f/hair/f_hair016.pac
0423,player/f/hair/f_hair017.pac
0424,player/f/hair/f_hair018.pac
0425,player/f/hair/f_hair019.pac
0426,player/f/hair/f_hair020.pac
0427,player/f/hair/f_hair021.pac
0428,player/f/hair/f_hair022.pac
0429,player/f/hair/f_hair023.pac
0430,player/f/hair/f_hair024.pac
0431,player/f/hair/f_hair025.pac
0432,player/f/hair/f_hair026.pac
0433,player/f/hair/f_hair027.pac
0434,player/f/hair/f_hair028.pac
0435,player/f/hair/f_hair029.pac
0436,player/f/hair/f_hair030.pac
0437,player/f/hair/f_hair031.pac
0438,player/f/hair/f_hair032.pac
0439,player/f/hair/f_hair033.pac
0440,player/f/hair/f_hair034.pac
0441,player/f/hair/f_hair035.pac
0442,player/f/hair/f_hair036.pac
0443,player/f/hair/f_hair037.pac
0444,player/f/hair/f_hair038.pac
0445,player/f/hair/f_hair039.pac
0446,player/f/hair/f_hair040.pac
0447,player/f/hair/f_hair041.pac
0448,player/f/hair/f_hair042.pac
0449,player/f/hair/f_hair043.pac
0450,player/f/hair/f_hair044.pac
0451,player/f/hair/f_hair045.pac
0452,player/f/hair/f_hair046.pac
0453,player/f/hair/f_hair047.pac
0454,player/f/hair/f_hair048.pac
0455,player/f/hair/f_hair049.pac
0456,player/f/hair/f_hair050.pac
0457,player/f/hair/f_hair051.pac
0458,player/f/hair/f_hair052.pac
0459,player/f/hair/f_hair053.pac
0460,player/f/hair/f_hair054.pac
0461,player/f/hair/f_hair055.pac
0462,player/f/hair/f_hair056.pac
0463,player/f/hair/f_hair057.pac
0464,player/f/hair/f_hair058.pac
0465,player/f/hair/f_hair059.pac
0466,player/f/hair/f_hair060.pac
0467,player/f/hair/f_hair061.pac
0468,player/f/hair/f_hair062.pac
0469,player/f/hair/f_hair063.pac
0470,player/f/hair/f_hair064.pac
0471,player/f/hair/f_hair065.pac
0472,player/f/hair/f_hair066.pac
0473,player/f/hair/f_hair067.pac
0474,player/f/hair/f_hair068.pac
0475,player/f/hair/f_hair069.pac
0476,player/f/hair/f_hair070.pac
0477,player/f/hair/f_hair071.pac
0478,player/f/hair/f_hair072.pac
0479,player/f/hair/f_hair073.pac
0480,player/f/hair/f_hair074.pac
0481,player/f/hair/f_hair075.pac
0482,player/f/hair/f_hair076.pac
0483,player/f/hair/f_hair077.pac
0484,player/f/hair/f_hair078.pac
0485,player/f/hair/f_hair079.pac
0486,player/f/hair/f_hair080.pac
0487,player/f/hair/f_hair081.pac
0488,player/f/hair/f_hair082.pac
0489,player/f/hair/f_hair083.pac
0490,player/f/hair/f_hair084.pac
0491,player/f/hair/f_hair085.pac
0492,player/f/hair/f_hair086.pac
0493,player/f/hair/f_hair087.pac
0494,player/f/hair/f_hair088.pac
0495,player/f/hair/f_hair089.pac
0496,player/f/hair/f_hair090.pac
0497,player/f/hair/f_hair091.pac
0498,player/f/hair/f_hair092.pac
0499,player/f/hair/f_hair093.pac
0500,player/f/hair/f_hair094.pac
0501,player/f/hair/f_hair095.pac
0502,player/f/hair/f_hair096.pac
0503,player/f/hair/f_hair097.pac
0504,player/f/hair/f_hair098.pac
0505,player/f/hair/f_hair099.pac
0506,player/f/hair/f_hair100.pac
0507,player/f/hair/f_hair101.pac
0508,player/f/hair/f_hair102.pac
0509,player/f/hair/f_hair103.pac
0510,player/f/hair/f_hair104.pac
0511,player/f/hair/f_hair105.pac
0512,player/f/hair/f_hair106.pac
0513,player/f/hair/f_hair107.pac
0514,player/f/hair/f_hair108.pac
0515,player/f/hair/f_hair109.pac
0516,player/f/hair/f_hair110.pac
0517,player/f/hair/f_hair111.pac
0518,player/f/hair/f_hair112.pac
0519,player/f/hair/f_hair113.pac
0520,player/f/hair/f_hair114.pac
0521,player/f/hair/f_hair115.pac
0522,player/f/hair/f_hair116.pac
0523,player/f/hair/f_hair117.pac
0524,player/f/hair/f_hair118.pac
0525,player/f/hair/f_hair119.pac
0526,player/f/hair/f_hair120.pac
0527,player/f/hair/f_hair121.pac
0528,player/f/hair/f_hair122.pac
0529,player/f/hair/f_hair123.pac
0530,player/f/hair/f_hair124.pac
0531,player/f/hair/f_hair125.pac
0532,player/f/hair/f_hair126.pac
0533,player/f/hair/f_hair127.pac
0534,player/f/hair/f_hair128.pac
0535,player/f/hair/f_hair129.pac
0536,player/f/hair/f_hair130.pac
0537,player/f/hair/f_hair131.pac
0538,player/f/hair/f_hair132.pac
0539,player/f/hair/f_hair133.pac
0540,player/f/hair/f_hair134.pac
0541,player/f/hair/f_hair135.pac
0542,player/f/hair/f_hair136.pac
0543,player/f/hair/f_hair137.pac
0544,player/f/hair/f_hair138.pac
0545,player/f/hair/f_hair139.pac
0546,player/f/hair/f_hair140.pac
0547,player/f/hair/f_hair141.pac
0548,player/f/hair/f_hair142.pac
0549,player/f/hair/f_hair143.pac
0550,player/f/hair/f_hair144.pac
0551,player/f/hair/f_hair145.pac
0552,player/f/hair/f_hair146.pac
0553,player/f/hair/f_hair147.pac
0554,player/f/hair/f_hair148.pac
0555,player/f/hair/f_hair149.pac
0556,player/f/hair/f_hair150.pac
0557,player/f/hair/f_hair151.pac
0558,player/f/hair/f_hair152.pac
0559,player/f/hair/f_hair153.pac
0560,player/f/hair/f_hair154.pac
0561,player/f/hair/f_hair155.pac
0562,player/f/hair/f_hair156.pac
0563,player/f/hair/f_hair157.pac
0564,player/f/hair/f_hair158.pac
0565,player/f/hair/f_hair159.pac
0566,player/f/hair/f_hair160.pac
0567,player/f/hair/f_hair161.pac
0568,player/f/hair/f_hair162.pac
0569,player/f/hair/f_hair163.pac
0570,player/f/hair/f_hair164.pac
0571,player/f/hair/f_hair165.pac
0572,player/f/hair/f_hair166.pac
0573,player/f/hair/f_hair167.pac
0574,player/f/hair/f_hair168.pac
0575,player/f/hair/f_hair169.pac
0576,player/f/hair/f_hair170.pac
0577,player/f/hair/f_hair171.pac
0578,player/f/hair/f_hair172.pac
0579,player/f/hair/f_hair173.pac
0580,player/f/hair/f_hair174.pac
0581,player/f/hair/f_hair175.pac
0582,player/f/hair/f_hair176.pac
0583,player/f/hair/f_hair177.pac
0584,player/f/hair/f_hair178.pac
0585,player/f/hair/f_hair179.pac
0586,player/f/hair/f_hair180.pac
0587,player/f/hair/f_hair181.pac
0588,player/f/hair/f_hair182.pac
0589,player/f/hair/f_hair183.pac
0590,player/f/hair/f_hair184.pac
0591,player/f/hair/f_hair185.pac
0592,player/f/hair/f_hair186.pac
0593,player/f/hair/f_hair187.pac
0594,player/f/hair/f_hair188.pac
0595,player/f/hair/f_hair189.pac
0596,player/f/hair/f_hair190.pac
0597,player/f/hair/f_hair191.pac
0598,player/f/hair/f_hair192.pac
0599,player/f/hair/f_hair193.pac
0600,player/f/hair/f_hair194.pac
0601,player/f/hair/f_hair195.pac
0602,player/f/hair/f_hair196.pac
0603,player/f/hair/f_hair197.pac
0604,player/f/hair/f_hair198.pac
0605,player/f/hair/f_hair199.pac
0606,player/f/hair/f_hair200.pac
0607,player/f/hair/f_hair201.pac
0608,player/f/hair/f_hair202.pac
0609,player/f/hair/f_hair203.pac
0610,player/f/hair/f_hair204.pac
0611,player/f/hair/f_hair205.pac
0612,player/f/hair/f_hair206.pac
0613,player/f/hair/f_hair207.pac
0614,player/f/hair/f_hair208.pac
0615,player/f/hair/f_hair209.pac
0616,player/f/hair/f_hair210.pac
0617,player/f/hair/f_hair211.pac
0618,player/f/hair/f_hair212.pac
0619,player/f/hair/f_hair213.pac
0620,player/f/hair/f_hair214.pac
0621,player/f/hair/f_hair215.pac
0622,player/f/hair/f_hair216.pac
0623,player/f/hair/f_hair217.pac
0624,player/f/hair/f_hair218.pac
0625,player/f/hair/f_hair219.pac
0626,player/f/hair/f_hair220.pac
0627,player/f/hair/f_hair221.pac
0628,player/f/hair/f_hair222.pac
0629,player/f/hair/f_hair223.pac
0630,player/f/hair/f_hair224.pac
0631,player/f/hair/f_hair225.pac
0632,player/f/hair/f_hair226.pac
0633,player/f/hair/f_hair227.pac
0634,player/f/hair/f_hair228.pac
0635,player/f/hair/f_hair229.pac
0636,player/f/hair/f_hair230.pac
0637,player/f/hair/f_hair231.pac
0638,player/f/hair/f_hair232.pac
0639,player/f/hair/f_hair233.pac
0640,player/f/hair/f_hair234.pac
0641,player/f/hair/f_hair235.pac
0642,player/f/hair/f_hair236.pac
0643,player/f/hair/f_hair237.pac
0644,player/f/hair/f_hair238.pac
0645,player/f/hair/f_hair239.pac
0646,player/f/hair/f_hair240.pac
0647,player/f/hair/f_hair241.pac
0648,player/f/hair/f_hair242.pac
0649,player/f/hair/f_hair243.pac
0650,player/f/hair/f_hair244.pac
0651,player/f/hair/f_hair245.pac
0652,player/f/hair/f_hair246.pac
0653,player/f/hair/f_hair247.pac
0654,player/f/hair/f_hair248.pac
0655,player/f/hair/f_hair249.pac
0656,player/f/hair/f_hair250.pac
0657,player/f/hair/f_hair251.pac
0658,player/f/hair/f_hair252.pac
0659,player/f/hair/f_hair253.pac
0660,player/f/hair/f_hair254.pac
0661,player/f/hair/f_hair255.pac
0662,player/f/hair/f_hair256.pac
0663,player/f/hair/f_hair257.pac
0664,player/f/hair/f_hair258.pac
0665,player/f/hair/f_hair259.pac
0666,player/f/hair/f_hair260.pac
0667,player/f/hair/f_hair261.pac
0668,player/f/hair/f_hair262.pac
0669,player/f/hair/f_hair263.pac
0670,player/f/hair/f_hair264.pac
0671,player/f/hair/f_hair265.pac
0672,player/f/hair/f_hair266.pac
0673,player/f/hair/f_hair267.pac
0674,player/f/hair/f_hair268.pac
0675,player/f/hair/f_hair269.pac
0676,player/f/hair/f_hair270.pac
0677,player/f/hair/f_hair271.pac
0678,player/f/hair/f_hair272.pac
0679,player/f/hair/f_hair273.pac
0680,player/f/hair/f_hair274.pac
0681,player/f/hair/f_hair275.pac
0682,player/f/hair/f_hair276.pac
0683,player/f/hair/f_hair277.pac
0684,player/f/hair/f_hair278.pac
0685,player/f/hair/f_hair279.pac
0686,player/f/hair/f_hair280.pac
0687,player/f/hair/f_hair281.pac
0688,player/f/hair/f_hair282.pac
0689,player/f/hair/f_hair283.pac
0690,player/f/hair/f_hair284.pac
0691,player/f/hair/f_hair285.pac
0692,player/f/hair/f_hair286.pac
0693,player/f/hair/f_hair287.pac
0694,player/f/hair/f_hair288.pac
0695,player/f/hair/f_hair289.pac
0696,player/f/hair/f_hair290.pac
0697,player/f/hair/f_hair291.pac
0698,player/f/hair/f_hair292.pac
0699,player/f/hair/f_hair293.pac
0700,player/f/hair/f_hair294.pac
0701,player/f/hair/f_hair295.pac
0702,player/f/hair/f_hair296.pac
0703,player/f/hair/f_hair297.pac
0704,player/f/hair/f_hair298.pac
0705,player/f/hair/f_hair299.pac
0706,player/f/hair/f_hair300.pac
0707,player/f/hair/f_hair301.pac
0708,player/f/hair/f_hair302.pac
0709,player/f/hair/f_hair303.pac
0710,player/f/hair/f_hair304.pac
0711,player/f/hair/f_hair305.pac
0712,player/f/hair/f_hair306.pac
0713,player/f/hair/f_hair307.pac
0714,player/f/hair/f_hair308.pac
0715,player/f/hair/f_hair309.pac
0716,player/f/hair/f_hair310.pac
0717,player/f/hair/f_hair311.pac
0718,player/f/hair/f_hair312.pac
0719,player/f/head/f_head000.pac
0720,player/f/head/f_head001.pac
0721,player/f/head/f_head002.pac
0722,player/f/head/f_head003.pac
0723,player/f/head/f_head004.pac
0724,player/f/head/f_head005.pac
0725,player/f/head/f_head006.pac
0726,player/f/head/f_head007.pac
0727,player/f/head/f_head008.pac
0728,player/f/head/f_head009.pac
0729,player/f/head/f_head010.pac
0730,player/f/head/f_head011.pac
0731,player/f/head/f_head012.pac
0732,player/f/head/f_head013.pac
0733,player/f/head/f_head014.pac
0734,player/f/head/f_head015.pac
0735,player/f/head/f_head016.pac
0736,player/f/head/f_head017.pac
0737,player/f/head/f_head018.pac
0738,player/f/head/f_head019.pac
0739,player/f/head/f_head020.pac
0740,player/f/head/f_head021.pac
0741,player/f/head/f_head022.pac
0742,player/f/head/f_head023.pac
0743,player/f/head/f_head024.pac
0744,player/f/head/f_head025.pac
0745,player/f/head/f_head026.pac
0746,player/f/body/f_body000.pac
0747,player/f/body/f_body001.pac
0748,player/f/body/f_body002.pac
0749,player/f/body/f_body003.pac
0750,player/f/body/f_body004.pac
0751,player/f/body/f_body005.pac
0752,player/f/body/f_body006.pac
0753,player/f/body/f_body007.pac
0754,player/f/body/f_body008.pac
0755,player/f/body/f_body009.pac
0756,player/f/body/f_body010.pac
0757,player/f/body/f_body011.pac
0758,player/f/body/f_body012.pac
0759,player/f/body/f_body013.pac
0760,player/f/body/f_body014.pac
0761,player/f/body/f_body015.pac
0762,player/f/body/f_body016.pac
0763,player/f/body/f_body017.pac
0764,player/f/body/f_body018.pac
0765,player/f/body/f_body019.pac
0766,player/f/body/f_body020.pac
0767,player/f/body/f_body021.pac
0768,player/f/body/f_body022.pac
0769,player/f/body/f_body023.pac
0770,player/f/body/f_body024.pac
0771,player/f/body/f_body025.pac
0772,player/f/body/f_body026.pac
0773,player/f/body/f_body027.pac
0774,player/f/body/f_body028.pac
0775,player/f/body/f_body029.pac
0776,player/f/body/f_body030.pac
0777,player/f/body/f_body031.pac
0778,player/f/body/f_body032.pac
0779,player/f/body/f_body033.pac
0780,player/f/body/f_body034.pac
0781,player/f/body/f_body035.pac
0782,player/f/body/f_body036.pac
0783,player/f/body/f_body037.pac
0784,player/f/body/f_body038.pac
0785,player/f/body/f_body039.pac
0786,player/f/body/f_body040.pac
0787,player/f/body/f_body041.pac
0788,player/f/body/f_body042.pac
0789,player/f/body/f_body043.pac
0790,player/f/body/f_body044.pac
0791,player/f/body/f_body045.pac
0792,player/f/body/f_body046.pac
0793,player/f/body/f_body047.pac
0794,player/f/body/f_body048.pac
0795,player/f/body/f_body049.pac
0796,player/f/body/f_body050.pac
0797,player/f/body/f_body051.pac
0798,player/f/body/f_body052.pac
0799,player/f/body/f_body053.pac
0800,player/f/body/f_body054.pac
0801,player/f/body/f_body055.pac
0802,player/f/body/f_body056.pac
0803,player/f/body/f_body057.pac
0804,player/f/body/f_body058.pac
0805,player/f/body/f_body059.pac
0806,player/f/body/f_body060.pac
0807,player/f/body/f_body061.pac
0808,player/f/body/f_body062.pac
0809,player/f/body/f_body063.pac
0810,player/f/body/f_body064.pac
0811,player/f/body/f_body065.pac
0812,player/f/body/f_body066.pac
0813,player/f/body/f_body067.pac
0814,player/f/body/f_body068.pac
0815,player/f/body/f_body069.pac
0816,player/f/body/f_body070.pac
0817,player/f/body/f_body071.pac
0818,player/f/body/f_body072.pac
0819,player/f/body/f_body073.pac
0820,player/f/body/f_body074.pac
0821,player/f/body/f_body075.pac
0822,player/f/body/f_body076.pac
0823,player/f/body/f_body077.pac
0824,player/f/body/f_body078.pac
0825,player/f/body/f_body079.pac
0826,player/f/body/f_body080.pac
0827,player/f/body/f_body081.pac
0828,player/f/body/f_body082.pac
0829,player/f/body/f_body083.pac
0830,player/f/body/f_body084.pac
0831,player/f/body/f_body085.pac
0832,player/f/body/f_body086.pac
0833,player/f/body/f_body087.pac
0834,player/f/body/f_body088.pac
0835,player/f/body/f_body089.pac
0836,player/f/body/f_body090.pac
0837,player/f/body/f_body091.pac
0838,player/f/body/f_body092.pac
0839,player/f/body/f_body093.pac
0840,player/f/body/f_body094.pac
0841,player/f/body/f_body095.pac
0842,player/f/body/f_body096.pac
0843,player/f/body/f_body097.pac
0844,player/f/body/f_body098.pac
0845,player/f/body/f_body099.pac
0846,player/f/body/f_body100.pac
0847,player/f/body/f_body101.pac
0848,player/f/body/f_body102.pac
0849,player/f/body/f_body103.pac
0850,player/f/body/f_body104.pac
0851,player/f/body/f_body105.pac
0852,player/f/body/f_body106.pac
0853,player/f/body/f_body107.pac
0854,player/f/body/f_body108.pac
0855,player/f/body/f_body109.pac
0856,player/f/body/f_body110.pac
0857,player/f/body/f_body111.pac
0858,player/f/body/f_body112.pac
0859,player/f/body/f_body113.pac
0860,player/f/body/f_body114.pac
0861,player/f/body/f_body115.pac
0862,player/f/body/f_body116.pac
0863,player/f/body/f_body117.pac
0864,player/f/body/f_body118.pac
0865,player/f/body/f_body119.pac
0866,player/f/body/f_body120.pac
0867,player/f/body/f_body121.pac
0868,player/f/body/f_body122.pac
0869,player/f/body/f_body123.pac
0870,player/f/body/f_body124.pac
0871,player/f/body/f_body125.pac
0872,player/f/body/f_body126.pac
0873,player/f/body/f_body127.pac
0874,player/f/body/f_body128.pac
0875,player/f/body/f_body129.pac
0876,player/f/body/f_body130.pac
0877,player/f/body/f_body131.pac
0878,player/f/body/f_body132.pac
0879,player/f/body/f_body133.pac
0880,player/f/body/f_body134.pac
0881,player/f/body/f_body135.pac
0882,player/f/body/f_body136.pac
0883,player/f/body/f_body137.pac
0884,player/f/body/f_body138.pac
0885,player/f/body/f_body139.pac
0886,player/f/body/f_body140.pac
0887,player/f/body/f_body141.pac
0888,player/f/body/f_body142.pac
0889,player/f/body/f_body143.pac
0890,player/f/body/f_body144.pac
0891,player/f/body/f_body145.pac
0892,player/f/body/f_body146.pac
0893,player/f/body/f_body147.pac
0894,player/f/body/f_body148.pac
0895,player/f/body/f_body149.pac
0896,player/f/body/f_body150.pac
0897,player/f/body/f_body151.pac
0898,player/f/body/f_body152.pac
0899,player/f/body/f_body153.pac
0900,player/f/body/f_body154.pac
0901,player/f/body/f_body155.pac
0902,player/f/body/f_body156.pac
0903,player/f/body/f_body157.pac
0904,player/f/body/f_body158.pac
0905,player/f/body/f_body159.pac
0906,player/f/body/f_body160.pac
0907,player/f/body/f_body161.pac
0908,player/f/body/f_body162.pac
0909,player/f/body/f_body163.pac
0910,player/f/body/f_body164.pac
0911,player/f/body/f_body165.pac
0912,player/f/body/f_body166.pac
0913,player/f/body/f_body167.pac
0914,player/f/body/f_body168.pac
0915,player/f/body/f_body169.pac
0916,player/f/body/f_body170.pac
0917,player/f/body/f_body171.pac
0918,player/f/body/f_body172.pac
0919,player/f/body/f_body173.pac
0920,player/f/body/f_body174.pac
0921,player/f/body/f_body175.pac
0922,player/f/body/f_body176.pac
0923,player/f/body/f_body177.pac
0924,player/f/body/f_body178.pac
0925,player/f/body/f_body179.pac
0926,player/f/body/f_body180.pac
0927,player/f/body/f_body181.pac
0928,player/f/body/f_body182.pac
0929,player/f/body/f_body183.pac
0930,player/f/body/f_body184.pac
0931,player/f/body/f_body185.pac
0932,player/f/body/f_body186.pac
0933,player/f/body/f_body187.pac
0934,player/f/body/f_body188.pac
0935,player/f/body/f_body189.pac
0936,player/f/body/f_body190.pac
0937,player/f/body/f_body191.pac
0938,player/f/body/f_body192.pac
0939,player/f/body/f_body193.pac
0940,player/f/body/f_body194.pac
0941,player/f/body/f_body195.pac
0942,player/f/body/f_body196.pac
0943,player/f/body/f_body197.pac
0944,player/f/body/f_body198.pac
0945,player/f/body/f_body199.pac
0946,player/f/body/f_body200.pac
0947,player/f/body/f_body201.pac
0948,player/f/body/f_body202.pac
0949,player/f/body/f_body203.pac
0950,player/f/body/f_body204.pac
0951,player/f/body/f_body205.pac
0952,player/f/body/f_body206.pac
0953,player/f/body/f_body207.pac
0954,player/f/body/f_body208.pac
0955,player/f/body/f_body209.pac
0956,player/f/body/f_body210.pac
0957,player/f/body/f_body211.pac
0958,player/f/body/f_body212.pac
0959,player/f/body/f_body213.pac
0960,player/f/body/f_body214.pac
0961,player/f/body/f_body215.pac
0962,player/f/body/f_body216.pac
0963,player/f/body/f_body217.pac
0964,player/f/body/f_body218.pac
0965,player/f/body/f_body219.pac
0966,player/f/body/f_body220.pac
0967,player/f/body/f_body221.pac
0968,player/f/body/f_body222.pac
0969,player/f/body/f_body223.pac
0970,player/f/body/f_body224.pac
0971,player/f/body/f_body225.pac
0972,player/f/body/f_body226.pac
0973,player/f/body/f_body227.pac
0974,player/f/body/f_body228.pac
0975,player/f/body/f_body229.pac
0976,player/f/body/f_body230.pac
0977,player/f/body/f_body231.pac
0978,player/f/body/f_body232.pac
0979,player/f/body/f_body233.pac
0980,player/f/body/f_body234.pac
0981,player/f/body/f_body235.pac
0982,player/f/body/f_body236.pac
0983,player/f/body/f_body237.pac
0984,player/f/body/f_body238.pac
0985,player/f/body/f_body239.pac
0986,player/f/body/f_body240.pac
0987,player/f/body/f_body241.pac
0988,player/f/body/f_body242.pac
0989,player/f/body/f_body243.pac
0990,player/f/body/f_body244.pac
0991,player/f/body/f_body245.pac
0992,player/f/body/f_body246.pac
0993,player/f/body/f_body247.pac
0994,player/f/body/f_body248.pac
0995,player/f/body/f_body249.pac
0996,player/f/body/f_body250.pac
0997,player/f/body/f_body251.pac
0998,player/f/body/f_body252.pac
0999,player/f/body/f_body253.pac
1000,player/f/body/f_body254.pac
1001,player/f/body/f_body255.pac
1002,player/f/body/f_body256.pac
1003,player/f/body/f_body257.pac
1004,player/f/body/f_body258.pac
1005,player/f/body/f_body259.pac
1006,player/f/body/f_body260.pac
1007,player/f/body/f_body261.pac
1008,player/f/body/f_body262.pac
1009,player/f/body/f_body263.pac
1010,player/f/body/f_body264.pac
1011,player/f/body/f_body265.pac
1012,player/f/body/f_body266.pac
1013,player/f/body/f_body267.pac
1014,player/f/body/f_body268.pac
1015,player/f/body/f_body269.pac
1016,player/f/body/f_body270.pac
1017,player/f/body/f_body271.pac
1018,player/f/body/f_body272.pac
1019,player/f/body/f_body273.pac
1020,player/f/body/f_body274.pac
1021,player/f/body/f_body275.pac
1022,player/f/body/f_body276.pac
1023,player/f/body/f_body277.pac
1024,player/f/body/f_body278.pac
1025,player/f/body/f_body279.pac
1026,player/f/body/f_body280.pac
1027,player/f/body/f_body281.pac
1028,player/f/body/f_body282.pac
1029,player/f/body/f_body283.pac
1030,player/f/body/f_body284.pac
1031,player/f/body/f_body285.pac
1032,player/f/body/f_body286.pac
1033,player/f/body/f_body287.pac
1034,player/f/body/f_body288.pac
1035,player/f/body/f_body289.pac
1036,player/f/body/f_body290.pac
1037,player/f/body/f_body291.pac
1038,player/f/body/f_body292.pac
1039,player/f/body/f_body293.pac
1040,player/f/body/f_body294.pac
1041,player/f/body/f_body295.pac
1042,player/f/body/f_body296.pac
1043,player/f/body/f_body297.pac
1044,player/f/body/f_body298.pac
1045,player/f/body/f_body299.pac
1046,player/f/body/f_body300.pac
1047,player/f/body/f_body301.pac
1048,player/f/body/f_body302.pac
1049,player/f/body/f_body303.pac
1050,player/f/body/f_body304.pac
1051,player/f/body/f_body305.pac
1052,player/f/body/f_body306.pac
1053,player/f/body/f_body307.pac
1054,player/f/body/f_body308.pac
1055,player/f/body/f_body309.pac
1056,player/f/body/f_body310.pac
1057,player/f/body/f_body311.pac
1058,player/f/body/f_body312.pac
1059,player/f/body/f_body313.pac
1060,player/f/body/f_body314.pac
1061,player/f/body/f_body315.pac
1062,player/f/body/f_body316.pac
1063,player/f/body/f_body317.pac
1064,player/f/body/f_body318.pac
1065,player/f/body/f_body319.pac
1066,player/f/body/f_body320.pac
1067,player/f/body/f_body321.pac
1068,player/f/body/f_body322.pac
1069,player/f/body/f_body323.pac
1070,player/f/body/f_body324.pac
1071,player/f/body/f_body325.pac
1072,player/f/body/f_body326.pac
1073,player/f/body/f_body327.pac
1074,player/f/body/f_body328.pac
1075,player/f/body/f_body329.pac
1076,player/f/body/f_body330.pac
1077,player/f/body/f_body331.pac
1078,player/f/body/f_body332.pac
1079,player/f/body/f_body333.pac
1080,player/f/body/f_body334.pac
1081,player/f/body/f_body335.pac
1082,player/f/body/f_body336.pac
1083,player/f/body/f_body337.pac
1084,player/f/body/f_body338.pac
1085,player/f/body/f_body339.pac
1086,player/f/arm/f_arm000.pac
1087,player/f/arm/f_arm001.pac
1088,player/f/arm/f_arm002.pac
1089,player/f/arm/f_arm003.pac
1090,player/f/arm/f_arm004.pac
1091,player/f/arm/f_arm005.pac
1092,player/f/arm/f_arm006.pac
1093,player/f/arm/f_arm007.pac
1094,player/f/arm/f_arm008.pac
1095,player/f/arm/f_arm009.pac
1096,player/f/arm/f_arm010.pac
1097,player/f/arm/f_arm011.pac
1098,player/f/arm/f_arm012.pac
1099,player/f/arm/f_arm013.pac
1100,player/f/arm/f_arm014.pac
1101,player/f/arm/f_arm015.pac
1102,player/f/arm/f_arm016.pac
1103,player/f/arm/f_arm017.pac
1104,player/f/arm/f_arm018.pac
1105,player/f/arm/f_arm019.pac
1106,player/f/arm/f_arm020.pac
1107,player/f/arm/f_arm021.pac
1108,player/f/arm/f_arm022.pac
1109,player/f/arm/f_arm023.pac
1110,player/f/arm/f_arm024.pac
1111,player/f/arm/f_arm025.pac
1112,player/f/arm/f_arm026.pac
1113,player/f/arm/f_arm027.pac
1114,player/f/arm/f_arm028.pac
1115,player/f/arm/f_arm029.pac
1116,player/f/arm/f_arm030.pac
1117,player/f/arm/f_arm031.pac
1118,player/f/arm/f_arm032.pac
1119,player/f/arm/f_arm033.pac
1120,player/f/arm/f_arm034.pac
1121,player/f/arm/f_arm035.pac
1122,player/f/arm/f_arm036.pac
1123,player/f/arm/f_arm037.pac
1124,player/f/arm/f_arm038.pac
1125,player/f/arm/f_arm039.pac
1126,player/f/arm/f_arm040.pac
1127,player/f/arm/f_arm041.pac
1128,player/f/arm/f_arm042.pac
1129,player/f/arm/f_arm043.pac
1130,player/f/arm/f_arm044.pac
1131,player/f/arm/f_arm045.pac
1132,player/f/arm/f_arm046.pac
1133,player/f/arm/f_arm047.pac
1134,player/f/arm/f_arm048.pac
1135,player/f/arm/f_arm049.pac
1136,player/f/arm/f_arm050.pac
1137,player/f/arm/f_arm051.pac
1138,player/f/arm/f_arm052.pac
1139,player/f/arm/f_arm053.pac
1140,player/f/arm/f_arm054.pac
1141,player/f/arm/f_arm055.pac
1142,player/f/arm/f_arm056.pac
1143,player/f/arm/f_arm057.pac
1144,player/f/arm/f_arm058.pac
1145,player/f/arm/f_arm059.pac
1146,player/f/arm/f_arm060.pac
1147,player/f/arm/f_arm061.pac
1148,player/f/arm/f_arm062.pac
1149,player/f/arm/f_arm063.pac
1150,player/f/arm/f_arm064.pac
1151,player/f/arm/f_arm065.pac
1152,player/f/arm/f_arm066.pac
1153,player/f/arm/f_arm067.pac
1154,player/f/arm/f_arm068.pac
1155,player/f/arm/f_arm069.pac
1156,player/f/arm/f_arm070.pac
1157,player/f/arm/f_arm071.pac
1158,player/f/arm/f_arm072.pac
1159,player/f/arm/f_arm073.pac
1160,player/f/arm/f_arm074.pac
1161,player/f/arm/f_arm075.pac
1162,player/f/arm/f_arm076.pac
1163,player/f/arm/f_arm077.pac
1164,player/f/arm/f_arm078.pac
1165,player/f/arm/f_arm079.pac
1166,player/f/arm/f_arm080.pac
1167,player/f/arm/f_arm081.pac
1168,player/f/arm/f_arm082.pac
1169,player/f/arm/f_arm083.pac
1170,player/f/arm/f_arm084.pac
1171,player/f/arm/f_arm085.pac
1172,player/f/arm/f_arm086.pac
1173,player/f/arm/f_arm087.pac
1174,player/f/arm/f_arm088.pac
1175,player/f/arm/f_arm089.pac
1176,player/f/arm/f_arm090.pac
1177,player/f/arm/f_arm091.pac
1178,player/f/arm/f_arm092.pac
1179,player/f/arm/f_arm093.pac
1180,player/f/arm/f_arm094.pac
1181,player/f/arm/f_arm095.pac
1182,player/f/arm/f_arm096.pac
1183,player/f/arm/f_arm097.pac
1184,player/f/arm/f_arm098.pac
1185,player/f/arm/f_arm099.pac
1186,player/f/arm/f_arm100.pac
1187,player/f/arm/f_arm101.pac
1188,player/f/arm/f_arm102.pac
1189,player/f/arm/f_arm103.pac
1190,player/f/arm/f_arm104.pac
1191,player/f/arm/f_arm105.pac
1192,player/f/arm/f_arm106.pac
1193,player/f/arm/f_arm107.pac
1194,player/f/arm/f_arm108.pac
1195,player/f/arm/f_arm109.pac
1196,player/f/arm/f_arm110.pac
1197,player/f/arm/f_arm111.pac
1198,player/f/arm/f_arm112.pac
1199,player/f/arm/f_arm113.pac
1200,player/f/arm/f_arm114.pac
1201,player/f/arm/f_arm115.pac
1202,player/f/arm/f_arm116.pac
1203,player/f/arm/f_arm117.pac
1204,player/f/arm/f_arm118.pac
1205,player/f/arm/f_arm119.pac
1206,player/f/arm/f_arm120.pac
1207,player/f/arm/f_arm121.pac
1208,player/f/arm/f_arm122.pac
1209,player/f/arm/f_arm123.pac
1210,player/f/arm/f_arm124.pac
1211,player/f/arm/f_arm125.pac
1212,player/f/arm/f_arm126.pac
1213,player/f/arm/f_arm127.pac
1214,player/f/arm/f_arm128.pac
1215,player/f/arm/f_arm129.pac
1216,player/f/arm/f_arm130.pac
1217,player/f/arm/f_arm131.pac
1218,player/f/arm/f_arm132.pac
1219,player/f/arm/f_arm133.pac
1220,player/f/arm/f_arm134.pac
1221,player/f/arm/f_arm135.pac
1222,player/f/arm/f_arm136.pac
1223,player/f/arm/f_arm137.pac
1224,player/f/arm/f_arm138.pac
1225,player/f/arm/f_arm139.pac
1226,player/f/arm/f_arm140.pac
1227,player/f/arm/f_arm141.pac
1228,player/f/arm/f_arm142.pac
1229,player/f/arm/f_arm143.pac
1230,player/f/arm/f_arm144.pac
1231,player/f/arm/f_arm145.pac
1232,player/f/arm/f_arm146.pac
1233,player/f/arm/f_arm147.pac
1234,player/f/arm/f_arm148.pac
1235,player/f/arm/f_arm149.pac
1236,player/f/arm/f_arm150.pac
1237,player/f/arm/f_arm151.pac
1238,player/f/arm/f_arm152.pac
1239,player/f/arm/f_arm153.pac
1240,player/f/arm/f_arm154.pac
1241,player/f/arm/f_arm155.pac
1242,player/f/arm/f_arm156.pac
1243,player/f/arm/f_arm157.pac
1244,player/f/arm/f_arm158.pac
1245,player/f/arm/f_arm159.pac
1246,player/f/arm/f_arm160.pac
1247,player/f/arm/f_arm161.pac
1248,player/f/arm/f_arm162.pac
1249,player/f/arm/f_arm163.pac
1250,player/f/arm/f_arm164.pac
1251,player/f/arm/f_arm165.pac
1252,player/f/arm/f_arm166.pac
1253,player/f/arm/f_arm167.pac
1254,player/f/arm/f_arm168.pac
1255,player/f/arm/f_arm169.pac
1256,player/f/arm/f_arm170.pac
1257,player/f/arm/f_arm171.pac
1258,player/f/arm/f_arm172.pac
1259,player/f/arm/f_arm173.pac
1260,player/f/arm/f_arm174.pac
1261,player/f/arm/f_arm175.pac
1262,player/f/arm/f_arm176.pac
1263,player/f/arm/f_arm177.pac
1264,player/f/arm/f_arm178.pac
1265,player/f/arm/f_arm179.pac
1266,player/f/arm/f_arm180.pac
1267,player/f/arm/f_arm181.pac
1268,player/f/arm/f_arm182.pac
1269,player/f/arm/f_arm183.pac
1270,player/f/arm/f_arm184.pac
1271,player/f/arm/f_arm185.pac
1272,player/f/arm/f_arm186.pac
1273,player/f/arm/f_arm187.pac
1274,player/f/arm/f_arm188.pac
1275,player/f/arm/f_arm189.pac
1276,player/f/arm/f_arm190.pac
1277,player/f/arm/f_arm191.pac
1278,player/f/arm/f_arm192.pac
1279,player/f/arm/f_arm193.pac
1280,player/f/arm/f_arm194.pac
1281,player/f/arm/f_arm195.pac
1282,player/f/arm/f_arm196.pac
1283,player/f/arm/f_arm197.pac
1284,player/f/arm/f_arm198.pac
1285,player/f/arm/f_arm199.pac
1286,player/f/arm/f_arm200.pac
1287,player/f/arm/f_arm201.pac
1288,player/f/arm/f_arm202.pac
1289,player/f/arm/f_arm203.pac
1290,player/f/arm/f_arm204.pac
1291,player/f/arm/f_arm205.pac
1292,player/f/arm/f_arm206.pac
1293,player/f/arm/f_arm207.pac
1294,player/f/arm/f_arm208.pac
1295,player/f/arm/f_arm209.pac
1296,player/f/arm/f_arm210.pac
1297,player/f/arm/f_arm211.pac
1298,player/f/arm/f_arm212.pac
1299,player/f/arm/f_arm213.pac
1300,player/f/arm/f_arm214.pac
1301,player/f/arm/f_arm215.pac
1302,player/f/arm/f_arm216.pac
1303,player/f/arm/f_arm217.pac
1304,player/f/arm/f_arm218.pac
1305,player/f/arm/f_arm219.pac
1306,player/f/arm/f_arm220.pac
1307,player/f/arm/f_arm221.pac
1308,player/f/arm/f_arm222.pac
1309,player/f/arm/f_arm223.pac
1310,player/f/arm/f_arm224.pac
1311,player/f/arm/f_arm225.pac
1312,player/f/arm/f_arm226.pac
1313,player/f/arm/f_arm227.pac
1314,player/f/arm/f_arm228.pac
1315,player/f/arm/f_arm229.pac
1316,player/f/arm/f_arm230.pac
1317,player/f/arm/f_arm231.pac
1318,player/f/arm/f_arm232.pac
1319,player/f/arm/f_arm233.pac
1320,player/f/arm/f_arm234.pac
1321,player/f/arm/f_arm235.pac
1322,player/f/arm/f_arm236.pac
1323,player/f/arm/f_arm237.pac
1324,player/f/arm/f_arm238.pac
1325,player/f/arm/f_arm239.pac
1326,player/f/arm/f_arm240.pac
1327,player/f/arm/f_arm241.pac
1328,player/f/arm/f_arm242.pac
1329,player/f/arm/f_arm243.pac
1330,player/f/arm/f_arm244.pac
1331,player/f/arm/f_arm245.pac
1332,player/f/arm/f_arm246.pac
1333,player/f/arm/f_arm247.pac
1334,player/f/arm/f_arm248.pac
1335,player/f/arm/f_arm249.pac
1336,player/f/arm/f_arm250.pac
1337,player/f/arm/f_arm251.pac
1338,player/f/arm/f_arm252.pac
1339,player/f/arm/f_arm253.pac
1340,player/f/arm/f_arm254.pac
1341,player/f/arm/f_arm255.pac
1342,player/f/arm/f_arm256.pac
1343,player/f/arm/f_arm257.pac
1344,player/f/arm/f_arm258.pac
1345,player/f/arm/f_arm259.pac
1346,player/f/arm/f_arm260.pac
1347,player/f/arm/f_arm261.pac
1348,player/f/arm/f_arm262.pac
1349,player/f/arm/f_arm263.pac
1350,player/f/arm/f_arm264.pac
1351,player/f/arm/f_arm265.pac
1352,player/f/arm/f_arm266.pac
1353,player/f/arm/f_arm267.pac
1354,player/f/arm/f_arm268.pac
1355,player/f/arm/f_arm269.pac
1356,player/f/arm/f_arm270.pac
1357,player/f/arm/f_arm271.pac
1358,player/f/arm/f_arm272.pac
1359,player/f/arm/f_arm273.pac
1360,player/f/arm/f_arm274.pac
1361,player/f/arm/f_arm275.pac
1362,player/f/arm/f_arm276.pac
1363,player/f/arm/f_arm277.pac
1364,player/f/arm/f_arm278.pac
1365,player/f/arm/f_arm279.pac
1366,player/f/arm/f_arm280.pac
1367,player/f/arm/f_arm281.pac
1368,player/f/arm/f_arm282.pac
1369,player/f/arm/f_arm283.pac
1370,player/f/arm/f_arm284.pac
1371,player/f/arm/f_arm285.pac
1372,player/f/arm/f_arm286.pac
1373,player/f/arm/f_arm287.pac
1374,player/f/arm/f_arm288.pac
1375,player/f/arm/f_arm289.pac
1376,player/f/arm/f_arm290.pac
1377,player/f/arm/f_arm291.pac
1378,player/f/arm/f_arm292.pac
1379,player/f/arm/f_arm293.pac
1380,player/f/arm/f_arm294.pac
1381,player/f/arm/f_arm295.pac
1382,player/f/arm/f_arm296.pac
1383,player/f/arm/f_arm297.pac
1384,player/f/arm/f_arm298.pac
1385,player/f/arm/f_arm299.pac
1386,player/f/arm/f_arm300.pac
1387,player/f/arm/f_arm301.pac
1388,player/f/arm/f_arm302.pac
1389,player/f/arm/f_arm303.pac
1390,player/f/arm/f_arm304.pac
1391,player/f/arm/f_arm305.pac
1392,player/f/arm/f_arm306.pac
1393,player/f/arm/f_arm307.pac
1394,player/f/arm/f_arm308.pac
1395,player/f/arm/f_arm309.pac
1396,player/f/arm/f_arm310.pac
1397,player/f/arm/f_arm311.pac
1398,player/f/arm/f_arm312.pac
1399,player/f/arm/f_arm313.pac
1400,player/f/arm/f_arm314.pac
1401,player/f/arm/f_arm315.pac
1402,player/f/arm/f_arm316.pac
1403,player/f/arm/f_arm317.pac
1404,player/f/arm/f_arm318.pac
1405,player/f/arm/f_arm319.pac
1406,player/f/arm/f_arm320.pac
1407,player/f/arm/f_arm321.pac
1408,player/f/arm/f_arm322.pac
1409,player/f/arm/f_arm323.pac
1410,player/f/arm/f_arm324.pac
1411,player/f/arm/f_arm325.pac
1412,player/f/arm/f_arm326.pac
1413,player/f/arm/f_arm327.pac
1414,player/f/arm/f_arm328.pac
1415,player/f/arm/f_arm329.pac
1416,player/f/arm/f_arm330.pac
1417,player/f/arm/f_arm331.pac
1418,player/f/arm/f_arm332.pac
1419,player/f/wst/f_wst000.pac
1420,player/f/wst/f_wst001.pac
1421,player/f/wst/f_wst002.pac
1422,player/f/wst/f_wst003.pac
1423,player/f/wst/f_wst004.pac
1424,player/f/wst/f_wst005.pac
1425,player/f/wst/f_wst006.pac
1426,player/f/wst/f_wst007.pac
1427,player/f/wst/f_wst008.pac
1428,player/f/wst/f_wst009.pac
1429,player/f/wst/f_wst010.pac
1430,player/f/wst/f_wst011.pac
1431,player/f/wst/f_wst012.pac
1432,player/f/wst/f_wst013.pac
1433,player/f/wst/f_wst014.pac
1434,player/f/wst/f_wst015.pac
1435,player/f/wst/f_wst016.pac
1436,player/f/wst/f_wst017.pac
1437,player/f/wst/f_wst018.pac
1438,player/f/wst/f_wst019.pac
1439,player/f/wst/f_wst020.pac
1440,player/f/wst/f_wst021.pac
1441,player/f/wst/f_wst022.pac
1442,player/f/wst/f_wst023.pac
1443,player/f/wst/f_wst024.pac
1444,player/f/wst/f_wst025.pac
1445,player/f/wst/f_wst026.pac
1446,player/f/wst/f_wst027.pac
1447,player/f/wst/f_wst028.pac
1448,player/f/wst/f_wst029.pac
1449,player/f/wst/f_wst030.pac
1450,player/f/wst/f_wst031.pac
1451,player/f/wst/f_wst032.pac
1452,player/f/wst/f_wst033.pac
1453,player/f/wst/f_wst034.pac
1454,player/f/wst/f_wst035.pac
1455,player/f/wst/f_wst036.pac
1456,player/f/wst/f_wst037.pac
1457,player/f/wst/f_wst038.pac
1458,player/f/wst/f_wst039.pac
1459,player/f/wst/f_wst040.pac
1460,player/f/wst/f_wst041.pac
1461,player/f/wst/f_wst042.pac
1462,player/f/wst/f_wst043.pac
1463,player/f/wst/f_wst044.pac
1464,player/f/wst/f_wst045.pac
1465,player/f/wst/f_wst046.pac
1466,player/f/wst/f_wst047.pac
1467,player/f/wst/f_wst048.pac
1468,player/f/wst/f_wst049.pac
1469,player/f/wst/f_wst050.pac
1470,player/f/wst/f_wst051.pac
1471,player/f/wst/f_wst052.pac
1472,player/f/wst/f_wst053.pac
1473,player/f/wst/f_wst054.pac
1474,player/f/wst/f_wst055.pac
1475,player/f/wst/f_wst056.pac
1476,player/f/wst/f_wst057.pac
1477,player/f/wst/f_wst058.pac
1478,player/f/wst/f_wst059.pac
1479,player/f/wst/f_wst060.pac
1480,player/f/wst/f_wst061.pac
1481,player/f/wst/f_wst062.pac
1482,player/f/wst/f_wst063.pac
1483,player/f/wst/f_wst064.pac
1484,player/f/wst/f_wst065.pac
1485,player/f/wst/f_wst066.pac
1486,player/f/wst/f_wst067.pac
1487,player/f/wst/f_wst068.pac
1488,player/f/wst/f_wst069.pac
1489,player/f/wst/f_wst070.pac
1490,player/f/wst/f_wst071.pac
1491,player/f/wst/f_wst072.pac
1492,player/f/wst/f_wst073.pac
1493,player/f/wst/f_wst074.pac
1494,player/f/wst/f_wst075.pac
1495,player/f/wst/f_wst076.pac
1496,player/f/wst/f_wst077.pac
1497,player/f/wst/f_wst078.pac
1498,player/f/wst/f_wst079.pac
1499,player/f/wst/f_wst080.pac
1500,player/f/wst/f_wst081.pac
1501,player/f/wst/f_wst082.pac
1502,player/f/wst/f_wst083.pac
1503,player/f/wst/f_wst084.pac
1504,player/f/wst/f_wst085.pac
1505,player/f/wst/f_wst086.pac
1506,player/f/wst/f_wst087.pac
1507,player/f/wst/f_wst088.pac
1508,player/f/wst/f_wst089.pac
1509,player/f/wst/f_wst090.pac
1510,player/f/wst/f_wst091.pac
1511,player/f/wst/f_wst092.pac
1512,player/f/wst/f_wst093.pac
1513,player/f/wst/f_wst094.pac
1514,player/f/wst/f_wst095.pac
1515,player/f/wst/f_wst096.pac
1516,player/f/wst/f_wst097.pac
1517,player/f/wst/f_wst098.pac
1518,player/f/wst/f_wst099.pac
1519,player/f/wst/f_wst100.pac
1520,player/f/wst/f_wst101.pac
1521,player/f/wst/f_wst102.pac
1522,player/f/wst/f_wst103.pac
1523,player/f/wst/f_wst104.pac
1524,player/f/wst/f_wst105.pac
1525,player/f/wst/f_wst106.pac
1526,player/f/wst/f_wst107.pac
1527,player/f/wst/f_wst108.pac
1528,player/f/wst/f_wst109.pac
1529,player/f/wst/f_wst110.pac
1530,player/f/wst/f_wst111.pac
1531,player/f/wst/f_wst112.pac
1532,player/f/wst/f_wst113.pac
1533,player/f/wst/f_wst114.pac
1534,player/f/wst/f_wst115.pac
1535,player/f/wst/f_wst116.pac
1536,player/f/wst/f_wst117.pac
1537,player/f/wst/f_wst118.pac
1538,player/f/wst/f_wst119.pac
1539,player/f/wst/f_wst120.pac
1540,player/f/wst/f_wst121.pac
1541,player/f/wst/f_wst122.pac
1542,player/f/wst/f_wst123.pac
1543,player/f/wst/f_wst124.pac
1544,player/f/wst/f_wst125.pac
1545,player/f/wst/f_wst126.pac
1546,player/f/wst/f_wst127.pac
1547,player/f/wst/f_wst128.pac
1548,player/f/wst/f_wst129.pac
1549,player/f/wst/f_wst130.pac
1550,player/f/wst/f_wst131.pac
1551,player/f/wst/f_wst132.pac
1552,player/f/wst/f_wst133.pac
1553,player/f/wst/f_wst134.pac
1554,player/f/wst/f_wst135.pac
1555,player/f/wst/f_wst136.pac
1556,player/f/wst/f_wst137.pac
1557,player/f/wst/f_wst138.pac
1558,player/f/wst/f_wst139.pac
1559,player/f/wst/f_wst140.pac
1560,player/f/wst/f_wst141.pac
1561,player/f/wst/f_wst142.pac
1562,player/f/wst/f_wst143.pac
1563,player/f/wst/f_wst144.pac
1564,player/f/wst/f_wst145.pac
1565,player/f/wst/f_wst146.pac
1566,player/f/wst/f_wst147.pac
1567,player/f/wst/f_wst148.pac
1568,player/f/wst/f_wst149.pac
1569,player/f/wst/f_wst150.pac
1570,player/f/wst/f_wst151.pac
1571,player/f/wst/f_wst152.pac
1572,player/f/wst/f_wst153.pac
1573,player/f/wst/f_wst154.pac
1574,player/f/wst/f_wst155.pac
1575,player/f/wst/f_wst156.pac
1576,player/f/wst/f_wst157.pac
1577,player/f/wst/f_wst158.pac
1578,player/f/wst/f_wst159.pac
1579,player/f/wst/f_wst160.pac
1580,player/f/wst/f_wst161.pac
1581,player/f/wst/f_wst162.pac
1582,player/f/wst/f_wst163.pac
1583,player/f/wst/f_wst164.pac
1584,player/f/wst/f_wst165.pac
1585,player/f/wst/f_wst166.pac
1586,player/f/wst/f_wst167.pac
1587,player/f/wst/f_wst168.pac
1588,player/f/wst/f_wst169.pac
1589,player/f/wst/f_wst170.pac
1590,player/f/wst/f_wst171.pac
1591,player/f/wst/f_wst172.pac
1592,player/f/wst/f_wst173.pac
1593,player/f/wst/f_wst174.pac
1594,player/f/wst/f_wst175.pac
1595,player/f/wst/f_wst176.pac
1596,player/f/wst/f_wst177.pac
1597,player/f/wst/f_wst178.pac
1598,player/f/wst/f_wst179.pac
1599,player/f/wst/f_wst180.pac
1600,player/f/wst/f_wst181.pac
1601,player/f/wst/f_wst182.pac
1602,player/f/wst/f_wst183.pac
1603,player/f/wst/f_wst184.pac
1604,player/f/wst/f_wst185.pac
1605,player/f/wst/f_wst186.pac
1606,player/f/wst/f_wst187.pac
1607,player/f/wst/f_wst188.pac
1608,player/f/wst/f_wst189.pac
1609,player/f/wst/f_wst190.pac
1610,player/f/wst/f_wst191.pac
1611,player/f/wst/f_wst192.pac
1612,player/f/wst/f_wst193.pac
1613,player/f/wst/f_wst194.pac
1614,player/f/wst/f_wst195.pac
1615,player/f/wst/f_wst196.pac
1616,player/f/wst/f_wst197.pac
1617,player/f/wst/f_wst198.pac
1618,player/f/wst/f_wst199.pac
1619,player/f/wst/f_wst200.pac
1620,player/f/wst/f_wst201.pac
1621,player/f/wst/f_wst202.pac
1622,player/f/wst/f_wst203.pac
1623,player/f/wst/f_wst204.pac
1624,player/f/wst/f_wst205.pac
1625,player/f/wst/f_wst206.pac
1626,player/f/wst/f_wst207.pac
1627,player/f/wst/f_wst208.pac
1628,player/f/wst/f_wst209.pac
1629,player/f/wst/f_wst210.pac
1630,player/f/wst/f_wst211.pac
1631,player/f/wst/f_wst212.pac
1632,player/f/wst/f_wst213.pac
1633,player/f/wst/f_wst214.pac
1634,player/f/wst/f_wst215.pac
1635,player/f/wst/f_wst216.pac
1636,player/f/wst/f_wst217.pac
1637,player/f/wst/f_wst218.pac
1638,player/f/wst/f_wst219.pac
1639,player/f/wst/f_wst220.pac
1640,player/f/wst/f_wst221.pac
1641,player/f/wst/f_wst222.pac
1642,player/f/wst/f_wst223.pac
1643,player/f/wst/f_wst224.pac
1644,player/f/wst/f_wst225.pac
1645,player/f/wst/f_wst226.pac
1646,player/f/wst/f_wst227.pac
1647,player/f/wst/f_wst228.pac
1648,player/f/wst/f_wst229.pac
1649,player/f/wst/f_wst230.pac
1650,player/f/wst/f_wst231.pac
1651,player/f/wst/f_wst232.pac
1652,player/f/wst/f_wst233.pac
1653,player/f/wst/f_wst234.pac
1654,player/f/wst/f_wst235.pac
1655,player/f/wst/f_wst236.pac
1656,player/f/wst/f_wst237.pac
1657,player/f/wst/f_wst238.pac
1658,player/f/wst/f_wst239.pac
1659,player/f/wst/f_wst240.pac
1660,player/f/wst/f_wst241.pac
1661,player/f/wst/f_wst242.pac
1662,player/f/wst/f_wst243.pac
1663,player/f/wst/f_wst244.pac
1664,player/f/wst/f_wst245.pac
1665,player/f/wst/f_wst246.pac
1666,player/f/wst/f_wst247.pac
1667,player/f/wst/f_wst248.pac
1668,player/f/wst/f_wst249.pac
1669,player/f/wst/f_wst250.pac
1670,player/f/wst/f_wst251.pac
1671,player/f/wst/f_wst252.pac
1672,player/f/wst/f_wst253.pac
1673,player/f/wst/f_wst254.pac
1674,player/f/wst/f_wst255.pac
1675,player/f/wst/f_wst256.pac
1676,player/f/wst/f_wst257.pac
1677,player/f/wst/f_wst258.pac
1678,player/f/wst/f_wst259.pac
1679,player/f/wst/f_wst260.pac
1680,player/f/wst/f_wst261.pac
1681,player/f/wst/f_wst262.pac
1682,player/f/wst/f_wst263.pac
1683,player/f/wst/f_wst264.pac
1684,player/f/wst/f_wst265.pac
1685,player/f/wst/f_wst266.pac
1686,player/f/wst/f_wst267.pac
1687,player/f/wst/f_wst268.pac
1688,player/f/wst/f_wst269.pac
1689,player/f/wst/f_wst270.pac
1690,player/f/wst/f_wst271.pac
1691,player/f/wst/f_wst272.pac
1692,player/f/wst/f_wst273.pac
1693,player/f/wst/f_wst274.pac
1694,player/f/wst/f_wst275.pac
1695,player/f/wst/f_wst276.pac
1696,player/f/wst/f_wst277.pac
1697,player/f/wst/f_wst278.pac
1698,player/f/wst/f_wst279.pac
1699,player/f/wst/f_wst280.pac
1700,player/f/wst/f_wst281.pac
1701,player/f/wst/f_wst282.pac
1702,player/f/wst/f_wst283.pac
1703,player/f/wst/f_wst284.pac
1704,player/f/wst/f_wst285.pac
1705,player/f/wst/f_wst286.pac
1706,player/f/wst/f_wst287.pac
1707,player/f/wst/f_wst288.pac
1708,player/f/wst/f_wst289.pac
1709,player/f/wst/f_wst290.pac
1710,player/f/wst/f_wst291.pac
1711,player/f/wst/f_wst292.pac
1712,player/f/wst/f_wst293.pac
1713,player/f/wst/f_wst294.pac
1714,player/f/wst/f_wst295.pac
1715,player/m/reg/m_reg000.pac
1716,player/m/reg/m_reg001.pac
1717,player/m/reg/m_reg002.pac
1718,player/m/reg/m_reg003.pac
1719,player/m/reg/m_reg004.pac
1720,player/m/reg/m_reg005.pac
1721,player/m/reg/m_reg006.pac
1722,player/m/reg/m_reg007.pac
1723,player/m/reg/m_reg008.pac
1724,player/m/reg/m_reg009.pac
1725,player/m/reg/m_reg010.pac
1726,player/m/reg/m_reg011.pac
1727,player/m/reg/m_reg012.pac
1728,player/m/reg/m_reg013.pac
1729,player/m/reg/m_reg014.pac
1730,player/m/reg/m_reg015.pac
1731,player/m/reg/m_reg016.pac
1732,player/m/reg/m_reg017.pac
1733,player/m/reg/m_reg018.pac
1734,player/m/reg/m_reg019.pac
1735,player/m/reg/m_reg020.pac
1736,player/m/reg/m_reg021.pac
1737,player/m/reg/m_reg022.pac
1738,player/m/reg/m_reg023.pac
1739,player/m/reg/m_reg024.pac
1740,player/m/reg/m_reg025.pac
1741,player/m/reg/m_reg026.pac
1742,player/m/reg/m_reg027.pac
1743,player/m/reg/m_reg028.pac
1744,player/m/reg/m_reg029.pac
1745,player/m/reg/m_reg030.pac
1746,player/m/reg/m_reg031.pac
1747,player/m/reg/m_reg032.pac
1748,player/m/reg/m_reg033.pac
1749,player/m/reg/m_reg034.pac
1750,player/m/reg/m_reg035.pac
1751,player/m/reg/m_reg036.pac
1752,player/m/reg/m_reg037.pac
1753,player/m/reg/m_reg038.pac
1754,player/m/reg/m_reg039.pac
1755,player/m/reg/m_reg040.pac
1756,player/m/reg/m_reg041.pac
1757,player/m/reg/m_reg042.pac
1758,player/m/reg/m_reg043.pac
1759,player/m/reg/m_reg044.pac
1760,player/m/reg/m_reg045.pac
1761,player/m/reg/m_reg046.pac
1762,player/m/reg/m_reg047.pac
1763,player/m/reg/m_reg048.pac
1764,player/m/reg/m_reg049.pac
1765,player/m/reg/m_reg050.pac
1766,player/m/reg/m_reg051.pac
1767,player/m/reg/m_reg052.pac
1768,player/m/reg/m_reg053.pac
1769,player/m/reg/m_reg054.pac
1770,player/m/reg/m_reg055.pac
1771,player/m/reg/m_reg056.pac
1772,player/m/reg/m_reg057.pac
1773,player/m/reg/m_reg058.pac
1774,player/m/reg/m_reg059.pac
1775,player/m/reg/m_reg060.pac
1776,player/m/reg/m_reg061.pac
1777,player/m/reg/m_reg062.pac
1778,player/m/reg/m_reg063.pac
1779,player/m/reg/m_reg064.pac
1780,player/m/reg/m_reg065.pac
1781,player/m/reg/m_reg066.pac
1782,player/m/reg/m_reg067.pac
1783,player/m/reg/m_reg068.pac
1784,player/m/reg/m_reg069.pac
1785,player/m/reg/m_reg070.pac
1786,player/m/reg/m_reg071.pac
1787,player/m/reg/m_reg072.pac
1788,player/m/reg/m_reg073.pac
1789,player/m/reg/m_reg074.pac
1790,player/m/reg/m_reg075.pac
1791,player/m/reg/m_reg076.pac
1792,player/m/reg/m_reg077.pac
1793,player/m/reg/m_reg078.pac
1794,player/m/reg/m_reg079.pac
1795,player/m/reg/m_reg080.pac
1796,player/m/reg/m_reg081.pac
1797,player/m/reg/m_reg082.pac
1798,player/m/reg/m_reg083.pac
1799,player/m/reg/m_reg084.pac
1800,player/m/reg/m_reg085.pac
1801,player/m/reg/m_reg086.pac
1802,player/m/reg/m_reg087.pac
1803,player/m/reg/m_reg088.pac
1804,player/m/reg/m_reg089.pac
1805,player/m/reg/m_reg090.pac
1806,player/m/reg/m_reg091.pac
1807,player/m/reg/m_reg092.pac
1808,player/m/reg/m_reg093.pac
1809,player/m/reg/m_reg094.pac
1810,player/m/reg/m_reg095.pac
1811,player/m/reg/m_reg096.pac
1812,player/m/reg/m_reg097.pac
1813,player/m/reg/m_reg098.pac
1814,player/m/reg/m_reg099.pac
1815,player/m/reg/m_reg100.pac
1816,player/m/reg/m_reg101.pac
1817,player/m/reg/m_reg102.pac
1818,player/m/reg/m_reg103.pac
1819,player/m/reg/m_reg104.pac
1820,player/m/reg/m_reg105.pac
1821,player/m/reg/m_reg106.pac
1822,player/m/reg/m_reg107.pac
1823,player/m/reg/m_reg108.pac
1824,player/m/reg/m_reg109.pac
1825,player/m/reg/m_reg110.pac
1826,player/m/reg/m_reg111.pac
1827,player/m/reg/m_reg112.pac
1828,player/m/reg/m_reg113.pac
1829,player/m/reg/m_reg114.pac
1830,player/m/reg/m_reg115.pac
1831,player/m/reg/m_reg116.pac
1832,player/m/reg/m_reg117.pac
1833,player/m/reg/m_reg118.pac
1834,player/m/reg/m_reg119.pac
1835,player/m/reg/m_reg120.pac
1836,player/m/reg/m_reg121.pac
1837,player/m/reg/m_reg122.pac
1838,player/m/reg/m_reg123.pac
1839,player/m/reg/m_reg124.pac
1840,player/m/reg/m_reg125.pac
1841,player/m/reg/m_reg126.pac
1842,player/m/reg/m_reg127.pac
1843,player/m/reg/m_reg128.pac
1844,player/m/reg/m_reg129.pac
1845,player/m/reg/m_reg130.pac
1846,player/m/reg/m_reg131.pac
1847,player/m/reg/m_reg132.pac
1848,player/m/reg/m_reg133.pac
1849,player/m/reg/m_reg134.pac
1850,player/m/reg/m_reg135.pac
1851,player/m/reg/m_reg136.pac
1852,player/m/reg/m_reg137.pac
1853,player/m/reg/m_reg138.pac
1854,player/m/reg/m_reg139.pac
1855,player/m/reg/m_reg140.pac
1856,player/m/reg/m_reg141.pac
1857,player/m/reg/m_reg142.pac
1858,player/m/reg/m_reg143.pac
1859,player/m/reg/m_reg144.pac
1860,player/m/reg/m_reg145.pac
1861,player/m/reg/m_reg146.pac
1862,player/m/reg/m_reg147.pac
1863,player/m/reg/m_reg148.pac
1864,player/m/reg/m_reg149.pac
1865,player/m/reg/m_reg150.pac
1866,player/m/reg/m_reg151.pac
1867,player/m/reg/m_reg152.pac
1868,player/m/reg/m_reg153.pac
1869,player/m/reg/m_reg154.pac
1870,player/m/reg/m_reg155.pac
1871,player/m/reg/m_reg156.pac
1872,player/m/reg/m_reg157.pac
1873,player/m/reg/m_reg158.pac
1874,player/m/reg/m_reg159.pac
1875,player/m/reg/m_reg160.pac
1876,player/m/reg/m_reg161.pac
1877,player/m/reg/m_reg162.pac
1878,player/m/reg/m_reg163.pac
1879,player/m/reg/m_reg164.pac
1880,player/m/reg/m_reg165.pac
1881,player/m/reg/m_reg166.pac
1882,player/m/reg/m_reg167.pac
1883,player/m/reg/m_reg168.pac
1884,player/m/reg/m_reg169.pac
1885,player/m/reg/m_reg170.pac
1886,player/m/reg/m_reg171.pac
1887,player/m/reg/m_reg172.pac
1888,player/m/reg/m_reg173.pac
1889,player/m/reg/m_reg174.pac
1890,player/m/reg/m_reg175.pac
1891,player/m/reg/m_reg176.pac
1892,player/m/reg/m_reg177.pac
1893,player/m/reg/m_reg178.pac
1894,player/m/reg/m_reg179.pac
1895,player/m/reg/m_reg180.pac
1896,player/m/reg/m_reg181.pac
1897,player/m/reg/m_reg182.pac
1898,player/m/reg/m_reg183.pac
1899,player/m/reg/m_reg184.pac
1900,player/m/reg/m_reg185.pac
1901,player/m/reg/m_reg186.pac
1902,player/m/reg/m_reg187.pac
1903,player/m/reg/m_reg188.pac
1904,player/m/reg/m_reg189.pac
1905,player/m/reg/m_reg190.pac
1906,player/m/reg/m_reg191.pac
1907,player/m/reg/m_reg192.pac
1908,player/m/reg/m_reg193.pac
1909,player/m/reg/m_reg194.pac
1910,player/m/reg/m_reg195.pac
1911,player/m/reg/m_reg196.pac
1912,player/m/reg/m_reg197.pac
1913,player/m/reg/m_reg198.pac
1914,player/m/reg/m_reg199.pac
1915,player/m/reg/m_reg200.pac
1916,player/m/reg/m_reg201.pac
1917,player/m/reg/m_reg202.pac
1918,player/m/reg/m_reg203.pac
1919,player/m/reg/m_reg204.pac
1920,player/m/reg/m_reg205.pac
1921,player/m/reg/m_reg206.pac
1922,player/m/reg/m_reg207.pac
1923,player/m/reg/m_reg208.pac
1924,player/m/reg/m_reg209.pac
1925,player/m/reg/m_reg210.pac
1926,player/m/reg/m_reg211.pac
1927,player/m/reg/m_reg212.pac
1928,player/m/reg/m_reg213.pac
1929,player/m/reg/m_reg214.pac
1930,player/m/reg/m_reg215.pac
1931,player/m/reg/m_reg216.pac
1932,player/m/reg/m_reg217.pac
1933,player/m/reg/m_reg218.pac
1934,player/m/reg/m_reg219.pac
1935,player/m/reg/m_reg220.pac
1936,player/m/reg/m_reg221.pac
1937,player/m/reg/m_reg222.pac
1938,player/m/reg/m_reg223.pac
1939,player/m/reg/m_reg224.pac
1940,player/m/reg/m_reg225.pac
1941,player/m/reg/m_reg226.pac
1942,player/m/reg/m_reg227.pac
1943,player/m/reg/m_reg228.pac
1944,player/m/reg/m_reg229.pac
1945,player/m/reg/m_reg230.pac
1946,player/m/reg/m_reg231.pac
1947,player/m/reg/m_reg232.pac
1948,player/m/reg/m_reg233.pac
1949,player/m/reg/m_reg234.pac
1950,player/m/reg/m_reg235.pac
1951,player/m/reg/m_reg236.pac
1952,player/m/reg/m_reg237.pac
1953,player/m/reg/m_reg238.pac
1954,player/m/reg/m_reg239.pac
1955,player/m/reg/m_reg240.pac
1956,player/m/reg/m_reg241.pac
1957,player/m/reg/m_reg242.pac
1958,player/m/reg/m_reg243.pac
1959,player/m/reg/m_reg244.pac
1960,player/m/reg/m_reg245.pac
1961,player/m/reg/m_reg246.pac
1962,player/m/reg/m_reg247.pac
1963,player/m/reg/m_reg248.pac
1964,player/m/reg/m_reg249.pac
1965,player/m/reg/m_reg250.pac
1966,player/m/reg/m_reg251.pac
1967,player/m/reg/m_reg252.pac
1968,player/m/reg/m_reg253.pac
1969,player/m/reg/m_reg254.pac
1970,player/m/reg/m_reg255.pac
1971,player/m/reg/m_reg256.pac
1972,player/m/reg/m_reg257.pac
1973,player/m/reg/m_reg258.pac
1974,player/m/reg/m_reg259.pac
1975,player/m/reg/m_reg260.pac
1976,player/m/reg/m_reg261.pac
1977,player/m/reg/m_reg262.pac
1978,player/m/reg/m_reg263.pac
1979,player/m/reg/m_reg264.pac
1980,player/m/reg/m_reg265.pac
1981,player/m/reg/m_reg266.pac
1982,player/m/reg/m_reg267.pac
1983,player/m/reg/m_reg268.pac
1984,player/m/reg/m_reg269.pac
1985,player/m/reg/m_reg270.pac
1986,player/m/reg/m_reg271.pac
1987,player/m/reg/m_reg272.pac
1988,player/m/reg/m_reg273.pac
1989,player/m/reg/m_reg274.pac
1990,player/m/reg/m_reg275.pac
1991,player/m/reg/m_reg276.pac
1992,player/m/reg/m_reg277.pac
1993,player/m/reg/m_reg278.pac
1994,player/m/reg/m_reg279.pac
1995,player/m/reg/m_reg280.pac
1996,player/m/reg/m_reg281.pac
1997,player/m/reg/m_reg282.pac
1998,player/m/reg/m_reg283.pac
1999,player/m/reg/m_reg284.pac
2000,player/m/reg/m_reg285.pac
2001,player/m/reg/m_reg286.pac
2002,player/m/reg/m_reg287.pac
2003,player/m/reg/m_reg288.pac
2004,player/m/reg/m_reg289.pac
2005,player/m/reg/m_reg290.pac
2006,player/m/reg/m_reg291.pac
2007,player/m/reg/m_reg292.pac
2008,player/m/reg/m_reg293.pac
2009,player/m/reg/m_reg294.pac
2010,player/m/reg/m_reg295.pac
2011,player/m/reg/m_reg296.pac
2012,player/m/reg/m_reg297.pac
2013,player/m/reg/m_reg298.pac
2014,player/m/reg/m_reg299.pac
2015,player/m/reg/m_reg300.pac
2016,player/m/reg/m_reg301.pac
2017,player/m/reg/m_reg302.pac
2018,player/m/reg/m_reg303.pac
2019,player/m/reg/m_reg304.pac
2020,player/m/reg/m_reg305.pac
2021,player/m/reg/m_reg306.pac
2022,player/m/reg/m_reg307.pac
2023,player/m/reg/m_reg308.pac
2024,player/m/reg/m_reg309.pac
2025,player/m/reg/m_reg310.pac
2026,player/m/reg/m_reg311.pac
2027,player/m/face/m_face000.pac
2028,player/m/face/m_face001.pac
2029,player/m/face/m_face002.pac
2030,player/m/face/m_face003.pac
2031,player/m/face/m_face004.pac
2032,player/m/face/m_face005.pac
2033,player/m/face/m_face006.pac
2034,player/m/face/m_face007.pac
2035,player/m/face/m_face008.pac
2036,player/m/face/m_face009.pac
2037,player/m/face/m_face010.pac
2038,player/m/face/m_face011.pac
2039,player/m/face/m_face012.pac
2040,player/m/face/m_face013.pac
2041,player/m/face/m_face014.pac
2042,player/m/face/m_face015.pac
2043,player/m/face/m_face016.pac
2044,player/m/face/m_face017.pac
2045,player/m/face/m_face018.pac
2046,player/m/face/m_face019.pac
2047,player/m/face/m_face020.pac
2048,player/m/face/m_face021.pac
2049,player/m/face/m_face022.pac
2050,player/m/face/m_face023.pac
2051,player/m/face/m_face024.pac
2052,player/m/face/m_face025.pac
2053,player/m/face/m_face026.pac
2054,player/m/face/m_face027.pac
2055,player/m/face/m_face028.pac
2056,player/m/face/m_face029.pac
2057,player/m/face/m_face030.pac
2058,player/m/face/m_face031.pac
2059,player/m/hair/m_hair000.pac
2060,player/m/hair/m_hair001.pac
2061,player/m/hair/m_hair002.pac
2062,player/m/hair/m_hair003.pac
2063,player/m/hair/m_hair004.pac
2064,player/m/hair/m_hair005.pac
2065,player/m/hair/m_hair006.pac
2066,player/m/hair/m_hair007.pac
2067,player/m/hair/m_hair008.pac
2068,player/m/hair/m_hair009.pac
2069,player/m/hair/m_hair010.pac
2070,player/m/hair/m_hair011.pac
2071,player/m/hair/m_hair012.pac
2072,player/m/hair/m_hair013.pac
2073,player/m/hair/m_hair014.pac
2074,player/m/hair/m_hair015.pac
2075,player/m/hair/m_hair016.pac
2076,player/m/hair/m_hair017.pac
2077,player/m/hair/m_hair018.pac
2078,player/m/hair/m_hair019.pac
2079,player/m/hair/m_hair020.pac
2080,player/m/hair/m_hair021.pac
2081,player/m/hair/m_hair022.pac
2082,player/m/hair/m_hair023.pac
2083,player/m/hair/m_hair024.pac
2084,player/m/hair/m_hair025.pac
2085,player/m/hair/m_hair026.pac
2086,player/m/hair/m_hair027.pac
2087,player/m/hair/m_hair028.pac
2088,player/m/hair/m_hair029.pac
2089,player/m/hair/m_hair030.pac
2090,player/m/hair/m_hair031.pac
2091,player/m/hair/m_hair032.pac
2092,player/m/hair/m_hair033.pac
2093,player/m/hair/m_hair034.pac
2094,player/m/hair/m_hair035.pac
2095,player/m/hair/m_hair036.pac
2096,player/m/hair/m_hair037.pac
2097,player/m/hair/m_hair038.pac
2098,player/m/hair/m_hair039.pac
2099,player/m/hair/m_hair040.pac
2100,player/m/hair/m_hair041.pac
2101,player/m/hair/m_hair042.pac
2102,player/m/hair/m_hair043.pac
2103,player/m/hair/m_hair044.pac
2104,player/m/hair/m_hair045.pac
2105,player/m/hair/m_hair046.pac
2106,player/m/hair/m_hair047.pac
2107,player/m/hair/m_hair048.pac
2108,player/m/hair/m_hair049.pac
2109,player/m/hair/m_hair050.pac
2110,player/m/hair/m_hair051.pac
2111,player/m/hair/m_hair052.pac
2112,player/m/hair/m_hair053.pac
2113,player/m/hair/m_hair054.pac
2114,player/m/hair/m_hair055.pac
2115,player/m/hair/m_hair056.pac
2116,player/m/hair/m_hair057.pac
2117,player/m/hair/m_hair058.pac
2118,player/m/hair/m_hair059.pac
2119,player/m/hair/m_hair060.pac
2120,player/m/hair/m_hair061.pac
2121,player/m/hair/m_hair062.pac
2122,player/m/hair/m_hair063.pac
2123,player/m/hair/m_hair064.pac
2124,player/m/hair/m_hair065.pac
2125,player/m/hair/m_hair066.pac
2126,player/m/hair/m_hair067.pac
2127,player/m/hair/m_hair068.pac
2128,player/m/hair/m_hair069.pac
2129,player/m/hair/m_hair070.pac
2130,player/m/hair/m_hair071.pac
2131,player/m/hair/m_hair072.pac
2132,player/m/hair/m_hair073.pac
2133,player/m/hair/m_hair074.pac
2134,player/m/hair/m_hair075.pac
2135,player/m/hair/m_hair076.pac
2136,player/m/hair/m_hair077.pac
2137,player/m/hair/m_hair078.pac
2138,player/m/hair/m_hair079.pac
2139,player/m/hair/m_hair080.pac
2140,player/m/hair/m_hair081.pac
2141,player/m/hair/m_hair082.pac
2142,player/m/hair/m_hair083.pac
2143,player/m/hair/m_hair084.pac
2144,player/m/hair/m_hair085.pac
2145,player/m/hair/m_hair086.pac
2146,player/m/hair/m_hair087.pac
2147,player/m/hair/m_hair088.pac
2148,player/m/hair/m_hair089.pac
2149,player/m/hair/m_hair090.pac
2150,player/m/hair/m_hair091.pac
2151,player/m/hair/m_hair092.pac
2152,player/m/hair/m_hair093.pac
2153,player/m/hair/m_hair094.pac
2154,player/m/hair/m_hair095.pac
2155,player/m/hair/m_hair096.pac
2156,player/m/hair/m_hair097.pac
2157,player/m/hair/m_hair098.pac
2158,player/m/hair/m_hair099.pac
2159,player/m/hair/m_hair100.pac
2160,player/m/hair/m_hair101.pac
2161,player/m/hair/m_hair102.pac
2162,player/m/hair/m_hair103.pac
2163,player/m/hair/m_hair104.pac
2164,player/m/hair/m_hair105.pac
2165,player/m/hair/m_hair106.pac
2166,player/m/hair/m_hair107.pac
2167,player/m/hair/m_hair108.pac
2168,player/m/hair/m_hair109.pac
2169,player/m/hair/m_hair110.pac
2170,player/m/hair/m_hair111.pac
2171,player/m/hair/m_hair112.pac
2172,player/m/hair/m_hair113.pac
2173,player/m/hair/m_hair114.pac
2174,player/m/hair/m_hair115.pac
2175,player/m/hair/m_hair116.pac
2176,player/m/hair/m_hair117.pac
2177,player/m/hair/m_hair118.pac
2178,player/m/hair/m_hair119.pac
2179,player/m/hair/m_hair120.pac
2180,player/m/hair/m_hair121.pac
2181,player/m/hair/m_hair122.pac
2182,player/m/hair/m_hair123.pac
2183,player/m/hair/m_hair124.pac
2184,player/m/hair/m_hair125.pac
2185,player/m/hair/m_hair126.pac
2186,player/m/hair/m_hair127.pac
2187,player/m/hair/m_hair128.pac
2188,player/m/hair/m_hair129.pac
2189,player/m/hair/m_hair130.pac
2190,player/m/hair/m_hair131.pac
2191,player/m/hair/m_hair132.pac
2192,player/m/hair/m_hair133.pac
2193,player/m/hair/m_hair134.pac
2194,player/m/hair/m_hair135.pac
2195,player/m/hair/m_hair136.pac
2196,player/m/hair/m_hair137.pac
2197,player/m/hair/m_hair138.pac
2198,player/m/hair/m_hair139.pac
2199,player/m/hair/m_hair140.pac
2200,player/m/hair/m_hair141.pac
2201,player/m/hair/m_hair142.pac
2202,player/m/hair/m_hair143.pac
2203,player/m/hair/m_hair144.pac
2204,player/m/hair/m_hair145.pac
2205,player/m/hair/m_hair146.pac
2206,player/m/hair/m_hair147.pac
2207,player/m/hair/m_hair148.pac
2208,player/m/hair/m_hair149.pac
2209,player/m/hair/m_hair150.pac
2210,player/m/hair/m_hair151.pac
2211,player/m/hair/m_hair152.pac
2212,player/m/hair/m_hair153.pac
2213,player/m/hair/m_hair154.pac
2214,player/m/hair/m_hair155.pac
2215,player/m/hair/m_hair156.pac
2216,player/m/hair/m_hair157.pac
2217,player/m/hair/m_hair158.pac
2218,player/m/hair/m_hair159.pac
2219,player/m/hair/m_hair160.pac
2220,player/m/hair/m_hair161.pac
2221,player/m/hair/m_hair162.pac
2222,player/m/hair/m_hair163.pac
2223,player/m/hair/m_hair164.pac
2224,player/m/hair/m_hair165.pac
2225,player/m/hair/m_hair166.pac
2226,player/m/hair/m_hair167.pac
2227,player/m/hair/m_hair168.pac
2228,player/m/hair/m_hair169.pac
2229,player/m/hair/m_hair170.pac
2230,player/m/hair/m_hair171.pac
2231,player/m/hair/m_hair172.pac
2232,player/m/hair/m_hair173.pac
2233,player/m/hair/m_hair174.pac
2234,player/m/hair/m_hair175.pac
2235,player/m/hair/m_hair176.pac
2236,player/m/hair/m_hair177.pac
2237,player/m/hair/m_hair178.pac
2238,player/m/hair/m_hair179.pac
2239,player/m/hair/m_hair180.pac
2240,player/m/hair/m_hair181.pac
2241,player/m/hair/m_hair182.pac
2242,player/m/hair/m_hair183.pac
2243,player/m/hair/m_hair184.pac
2244,player/m/hair/m_hair185.pac
2245,player/m/hair/m_hair186.pac
2246,player/m/hair/m_hair187.pac
2247,player/m/hair/m_hair188.pac
2248,player/m/hair/m_hair189.pac
2249,player/m/hair/m_hair190.pac
2250,player/m/hair/m_hair191.pac
2251,player/m/hair/m_hair192.pac
2252,player/m/hair/m_hair193.pac
2253,player/m/hair/m_hair194.pac
2254,player/m/hair/m_hair195.pac
2255,player/m/hair/m_hair196.pac
2256,player/m/hair/m_hair197.pac
2257,player/m/hair/m_hair198.pac
2258,player/m/hair/m_hair199.pac
2259,player/m/hair/m_hair200.pac
2260,player/m/hair/m_hair201.pac
2261,player/m/hair/m_hair202.pac
2262,player/m/hair/m_hair203.pac
2263,player/m/hair/m_hair204.pac
2264,player/m/hair/m_hair205.pac
2265,player/m/hair/m_hair206.pac
2266,player/m/hair/m_hair207.pac
2267,player/m/hair/m_hair208.pac
2268,player/m/hair/m_hair209.pac
2269,player/m/hair/m_hair210.pac
2270,player/m/hair/m_hair211.pac
2271,player/m/hair/m_hair212.pac
2272,player/m/hair/m_hair213.pac
2273,player/m/hair/m_hair214.pac
2274,player/m/hair/m_hair215.pac
2275,player/m/hair/m_hair216.pac
2276,player/m/hair/m_hair217.pac
2277,player/m/hair/m_hair218.pac
2278,player/m/hair/m_hair219.pac
2279,player/m/hair/m_hair220.pac
2280,player/m/hair/m_hair221.pac
2281,player/m/hair/m_hair222.pac
2282,player/m/hair/m_hair223.pac
2283,player/m/hair/m_hair224.pac
2284,player/m/hair/m_hair225.pac
2285,player/m/hair/m_hair226.pac
2286,player/m/hair/m_hair227.pac
2287,player/m/hair/m_hair228.pac
2288,player/m/hair/m_hair229.pac
2289,player/m/hair/m_hair230.pac
2290,player/m/hair/m_hair231.pac
2291,player/m/hair/m_hair232.pac
2292,player/m/hair/m_hair233.pac
2293,player/m/hair/m_hair234.pac
2294,player/m/hair/m_hair235.pac
2295,player/m/hair/m_hair236.pac
2296,player/m/hair/m_hair237.pac
2297,player/m/hair/m_hair238.pac
2298,player/m/hair/m_hair239.pac
2299,player/m/hair/m_hair240.pac
2300,player/m/hair/m_hair241.pac
2301,player/m/hair/m_hair242.pac
2302,player/m/hair/m_hair243.pac
2303,player/m/hair/m_hair244.pac
2304,player/m/hair/m_hair245.pac
2305,player/m/hair/m_hair246.pac
2306,player/m/hair/m_hair247.pac
2307,player/m/hair/m_hair248.pac
2308,player/m/hair/m_hair249.pac
2309,player/m/hair/m_hair250.pac
2310,player/m/hair/m_hair251.pac
2311,player/m/hair/m_hair252.pac
2312,player/m/hair/m_hair253.pac
2313,player/m/hair/m_hair254.pac
2314,player/m/hair/m_hair255.pac
2315,player/m/hair/m_hair256.pac
2316,player/m/hair/m_hair257.pac
2317,player/m/hair/m_hair258.pac
2318,player/m/hair/m_hair259.pac
2319,player/m/hair/m_hair260.pac
2320,player/m/hair/m_hair261.pac
2321,player/m/hair/m_hair262.pac
2322,player/m/hair/m_hair263.pac
2323,player/m/hair/m_hair264.pac
2324,player/m/hair/m_hair265.pac
2325,player/m/hair/m_hair266.pac
2326,player/m/hair/m_hair267.pac
2327,player/m/hair/m_hair268.pac
2328,player/m/hair/m_hair269.pac
2329,player/m/hair/m_hair270.pac
2330,player/m/hair/m_hair271.pac
2331,player/m/hair/m_hair272.pac
2332,player/m/hair/m_hair273.pac
2333,player/m/hair/m_hair274.pac
2334,player/m/hair/m_hair275.pac
2335,player/m/hair/m_hair276.pac
2336,player/m/hair/m_hair277.pac
2337,player/m/hair/m_hair278.pac
2338,player/m/hair/m_hair279.pac
2339,player/m/hair/m_hair280.pac
2340,player/m/hair/m_hair281.pac
2341,player/m/hair/m_hair282.pac
2342,player/m/hair/m_hair283.pac
2343,player/m/hair/m_hair284.pac
2344,player/m/hair/m_hair285.pac
2345,player/m/hair/m_hair286.pac
2346,player/m/hair/m_hair287.pac
2347,player/m/hair/m_hair288.pac
2348,player/m/hair/m_hair289.pac
2349,player/m/hair/m_hair290.pac
2350,player/m/hair/m_hair291.pac
2351,player/m/hair/m_hair292.pac
2352,player/m/hair/m_hair293.pac
2353,player/m/hair/m_hair294.pac
2354,player/m/hair/m_hair295.pac
2355,player/m/hair/m_hair296.pac
2356,player/m/hair/m_hair297.pac
2357,player/m/hair/m_hair298.pac
2358,player/m/hair/m_hair299.pac
2359,player/m/hair/m_hair300.pac
2360,player/m/hair/m_hair301.pac
2361,player/m/hair/m_hair302.pac
2362,player/m/hair/m_hair303.pac
2363,player/m/hair/m_hair304.pac
2364,player/m/hair/m_hair305.pac
2365,player/m/hair/m_hair306.pac
2366,player/m/hair/m_hair307.pac
2367,player/m/hair/m_hair308.pac
2368,player/m/hair/m_hair309.pac
2369,player/m/hair/m_hair310.pac
2370,player/m/hair/m_hair311.pac
2371,player/m/hair/m_hair312.pac
2372,player/m/hair/m_hair313.pac
2373,player/m/head/m_head000.pac
2374,player/m/head/m_head001.pac
2375,player/m/head/m_head002.pac
2376,player/m/head/m_head003.pac
2377,player/m/head/m_head004.pac
2378,player/m/head/m_head005.pac
2379,player/m/head/m_head006.pac
2380,player/m/head/m_head007.pac
2381,player/m/head/m_head008.pac
2382,player/m/head/m_head009.pac
2383,player/m/head/m_head010.pac
2384,player/m/head/m_head011.pac
2385,player/m/head/m_head012.pac
2386,player/m/head/m_head013.pac
2387,player/m/head/m_head014.pac
2388,player/m/head/m_head015.pac
2389,player/m/head/m_head016.pac
2390,player/m/head/m_head017.pac
2391,player/m/head/m_head018.pac
2392,player/m/head/m_head019.pac
2393,player/m/head/m_head020.pac
2394,player/m/head/m_head021.pac
2395,player/m/head/m_head022.pac
2396,player/m/head/m_head023.pac
2397,player/m/head/m_head024.pac
2398,player/m/head/m_head025.pac
2399,player/m/head/m_head026.pac
2400,player/m/body/m_body000.pac
2401,player/m/body/m_body001.pac
2402,player/m/body/m_body002.pac
2403,player/m/body/m_body003.pac
2404,player/m/body/m_body004.pac
2405,player/m/body/m_body005.pac
2406,player/m/body/m_body006.pac
2407,player/m/body/m_body007.pac
2408,player/m/body/m_body008.pac
2409,player/m/body/m_body009.pac
2410,player/m/body/m_body010.pac
2411,player/m/body/m_body011.pac
2412,player/m/body/m_body012.pac
2413,player/m/body/m_body013.pac
2414,player/m/body/m_body014.pac
2415,player/m/body/m_body015.pac
2416,player/m/body/m_body016.pac
2417,player/m/body/m_body017.pac
2418,player/m/body/m_body018.pac
2419,player/m/body/m_body019.pac
2420,player/m/body/m_body020.pac
2421,player/m/body/m_body021.pac
2422,player/m/body/m_body022.pac
2423,player/m/body/m_body023.pac
2424,player/m/body/m_body024.pac
2425,player/m/body/m_body025.pac
2426,player/m/body/m_body026.pac
2427,player/m/body/m_body027.pac
2428,player/m/body/m_body028.pac
2429,player/m/body/m_body029.pac
2430,player/m/body/m_body030.pac
2431,player/m/body/m_body031.pac
2432,player/m/body/m_body032.pac
2433,player/m/body/m_body033.pac
2434,player/m/body/m_body034.pac
2435,player/m/body/m_body035.pac
2436,player/m/body/m_body036.pac
2437,player/m/body/m_body037.pac
2438,player/m/body/m_body038.pac
2439,player/m/body/m_body039.pac
2440,player/m/body/m_body040.pac
2441,player/m/body/m_body041.pac
2442,player/m/body/m_body042.pac
2443,player/m/body/m_body043.pac
2444,player/m/body/m_body044.pac
2445,player/m/body/m_body045.pac
2446,player/m/body/m_body046.pac
2447,player/m/body/m_body047.pac
2448,player/m/body/m_body048.pac
2449,player/m/body/m_body049.pac
2450,player/m/body/m_body050.pac
2451,player/m/body/m_body051.pac
2452,player/m/body/m_body052.pac
2453,player/m/body/m_body053.pac
2454,player/m/body/m_body054.pac
2455,player/m/body/m_body055.pac
2456,player/m/body/m_body056.pac
2457,player/m/body/m_body057.pac
2458,player/m/body/m_body058.pac
2459,player/m/body/m_body059.pac
2460,player/m/body/m_body060.pac
2461,player/m/body/m_body061.pac
2462,player/m/body/m_body062.pac
2463,player/m/body/m_body063.pac
2464,player/m/body/m_body064.pac
2465,player/m/body/m_body065.pac
2466,player/m/body/m_body066.pac
2467,player/m/body/m_body067.pac
2468,player/m/body/m_body068.pac
2469,player/m/body/m_body069.pac
2470,player/m/body/m_body070.pac
2471,player/m/body/m_body071.pac
2472,player/m/body/m_body072.pac
2473,player/m/body/m_body073.pac
2474,player/m/body/m_body074.pac
2475,player/m/body/m_body075.pac
2476,player/m/body/m_body076.pac
2477,player/m/body/m_body077.pac
2478,player/m/body/m_body078.pac
2479,player/m/body/m_body079.pac
2480,player/m/body/m_body080.pac
2481,player/m/body/m_body081.pac
2482,player/m/body/m_body082.pac
2483,player/m/body/m_body083.pac
2484,player/m/body/m_body084.pac
2485,player/m/body/m_body085.pac
2486,player/m/body/m_body086.pac
2487,player/m/body/m_body087.pac
2488,player/m/body/m_body088.pac
2489,player/m/body/m_body089.pac
2490,player/m/body/m_body090.pac
2491,player/m/body/m_body091.pac
2492,player/m/body/m_body092.pac
2493,player/m/body/m_body093.pac
2494,player/m/body/m_body094.pac
2495,player/m/body/m_body095.pac
2496,player/m/body/m_body096.pac
2497,player/m/body/m_body097.pac
2498,player/m/body/m_body098.pac
2499,player/m/body/m_body099.pac
2500,player/m/body/m_body100.pac
2501,player/m/body/m_body101.pac
2502,player/m/body/m_body102.pac
2503,player/m/body/m_body103.pac
2504,player/m/body/m_body104.pac
2505,player/m/body/m_body105.pac
2506,player/m/body/m_body106.pac
2507,player/m/body/m_body107.pac
2508,player/m/body/m_body108.pac
2509,player/m/body/m_body109.pac
2510,player/m/body/m_body110.pac
2511,player/m/body/m_body111.pac
2512,player/m/body/m_body112.pac
2513,player/m/body/m_body113.pac
2514,player/m/body/m_body114.pac
2515,player/m/body/m_body115.pac
2516,player/m/body/m_body116.pac
2517,player/m/body/m_body117.pac
2518,player/m/body/m_body118.pac
2519,player/m/body/m_body119.pac
2520,player/m/body/m_body120.pac
2521,player/m/body/m_body121.pac
2522,player/m/body/m_body122.pac
2523,player/m/body/m_body123.pac
2524,player/m/body/m_body124.pac
2525,player/m/body/m_body125.pac
2526,player/m/body/m_body126.pac
2527,player/m/body/m_body127.pac
2528,player/m/body/m_body128.pac
2529,player/m/body/m_body129.pac
2530,player/m/body/m_body130.pac
2531,player/m/body/m_body131.pac
2532,player/m/body/m_body132.pac
2533,player/m/body/m_body133.pac
2534,player/m/body/m_body134.pac
2535,player/m/body/m_body135.pac
2536,player/m/body/m_body136.pac
2537,player/m/body/m_body137.pac
2538,player/m/body/m_body138.pac
2539,player/m/body/m_body139.pac
2540,player/m/body/m_body140.pac
2541,player/m/body/m_body141.pac
2542,player/m/body/m_body142.pac
2543,player/m/body/m_body143.pac
2544,player/m/body/m_body144.pac
2545,player/m/body/m_body145.pac
2546,player/m/body/m_body146.pac
2547,player/m/body/m_body147.pac
2548,player/m/body/m_body148.pac
2549,player/m/body/m_body149.pac
2550,player/m/body/m_body150.pac
2551,player/m/body/m_body151.pac
2552,player/m/body/m_body152.pac
2553,player/m/body/m_body153.pac
2554,player/m/body/m_body154.pac
2555,player/m/body/m_body155.pac
2556,player/m/body/m_body156.pac
2557,player/m/body/m_body157.pac
2558,player/m/body/m_body158.pac
2559,player/m/body/m_body159.pac
2560,player/m/body/m_body160.pac
2561,player/m/body/m_body161.pac
2562,player/m/body/m_body162.pac
2563,player/m/body/m_body163.pac
2564,player/m/body/m_body164.pac
2565,player/m/body/m_body165.pac
2566,player/m/body/m_body166.pac
2567,player/m/body/m_body167.pac
2568,player/m/body/m_body168.pac
2569,player/m/body/m_body169.pac
2570,player/m/body/m_body170.pac
2571,player/m/body/m_body171.pac
2572,player/m/body/m_body172.pac
2573,player/m/body/m_body173.pac
2574,player/m/body/m_body174.pac
2575,player/m/body/m_body175.pac
2576,player/m/body/m_body176.pac
2577,player/m/body/m_body177.pac
2578,player/m/body/m_body178.pac
2579,player/m/body/m_body179.pac
2580,player/m/body/m_body180.pac
2581,player/m/body/m_body181.pac
2582,player/m/body/m_body182.pac
2583,player/m/body/m_body183.pac
2584,player/m/body/m_body184.pac
2585,player/m/body/m_body185.pac
2586,player/m/body/m_body186.pac
2587,player/m/body/m_body187.pac
2588,player/m/body/m_body188.pac
2589,player/m/body/m_body189.pac
2590,player/m/body/m_body190.pac
2591,player/m/body/m_body191.pac
2592,player/m/body/m_body192.pac
2593,player/m/body/m_body193.pac
2594,player/m/body/m_body194.pac
2595,player/m/body/m_body195.pac
2596,player/m/body/m_body196.pac
2597,player/m/body/m_body197.pac
2598,player/m/body/m_body198.pac
2599,player/m/body/m_body199.pac
2600,player/m/body/m_body200.pac
2601,player/m/body/m_body201.pac
2602,player/m/body/m_body202.pac
2603,player/m/body/m_body203.pac
2604,player/m/body/m_body204.pac
2605,player/m/body/m_body205.pac
2606,player/m/body/m_body206.pac
2607,player/m/body/m_body207.pac
2608,player/m/body/m_body208.pac
2609,player/m/body/m_body209.pac
2610,player/m/body/m_body210.pac
2611,player/m/body/m_body211.pac
2612,player/m/body/m_body212.pac
2613,player/m/body/m_body213.pac
2614,player/m/body/m_body214.pac
2615,player/m/body/m_body215.pac
2616,player/m/body/m_body216.pac
2617,player/m/body/m_body217.pac
2618,player/m/body/m_body218.pac
2619,player/m/body/m_body219.pac
2620,player/m/body/m_body220.pac
2621,player/m/body/m_body221.pac
2622,player/m/body/m_body222.pac
2623,player/m/body/m_body223.pac
2624,player/m/body/m_body224.pac
2625,player/m/body/m_body225.pac
2626,player/m/body/m_body226.pac
2627,player/m/body/m_body227.pac
2628,player/m/body/m_body228.pac
2629,player/m/body/m_body229.pac
2630,player/m/body/m_body230.pac
2631,player/m/body/m_body231.pac
2632,player/m/body/m_body232.pac
2633,player/m/body/m_body233.pac
2634,player/m/body/m_body234.pac
2635,player/m/body/m_body235.pac
2636,player/m/body/m_body236.pac
2637,player/m/body/m_body237.pac
2638,player/m/body/m_body238.pac
2639,player/m/body/m_body239.pac
2640,player/m/body/m_body240.pac
2641,player/m/body/m_body241.pac
2642,player/m/body/m_body242.pac
2643,player/m/body/m_body243.pac
2644,player/m/body/m_body244.pac
2645,player/m/body/m_body245.pac
2646,player/m/body/m_body246.pac
2647,player/m/body/m_body247.pac
2648,player/m/body/m_body248.pac
2649,player/m/body/m_body249.pac
2650,player/m/body/m_body250.pac
2651,player/m/body/m_body251.pac
2652,player/m/body/m_body252.pac
2653,player/m/body/m_body253.pac
2654,player/m/body/m_body254.pac
2655,player/m/body/m_body255.pac
2656,player/m/body/m_body256.pac
2657,player/m/body/m_body257.pac
2658,player/m/body/m_body258.pac
2659,player/m/body/m_body259.pac
2660,player/m/body/m_body260.pac
2661,player/m/body/m_body261.pac
2662,player/m/body/m_body262.pac
2663,player/m/body/m_body263.pac
2664,player/m/body/m_body264.pac
2665,player/m/body/m_body265.pac
2666,player/m/body/m_body266.pac
2667,player/m/body/m_body267.pac
2668,player/m/body/m_body268.pac
2669,player/m/body/m_body269.pac
2670,player/m/body/m_body270.pac
2671,player/m/body/m_body271.pac
2672,player/m/body/m_body272.pac
2673,player/m/body/m_body273.pac
2674,player/m/body/m_body274.pac
2675,player/m/body/m_body275.pac
2676,player/m/body/m_body276.pac
2677,player/m/body/m_body277.pac
2678,player/m/body/m_body278.pac
2679,player/m/body/m_body279.pac
2680,player/m/body/m_body280.pac
2681,player/m/body/m_body281.pac
2682,player/m/body/m_body282.pac
2683,player/m/body/m_body283.pac
2684,player/m/body/m_body284.pac
2685,player/m/body/m_body285.pac
2686,player/m/body/m_body286.pac
2687,player/m/body/m_body287.pac
2688,player/m/body/m_body288.pac
2689,player/m/body/m_body289.pac
2690,player/m/body/m_body290.pac
2691,player/m/body/m_body291.pac
2692,player/m/body/m_body292.pac
2693,player/m/body/m_body293.pac
2694,player/m/body/m_body294.pac
2695,player/m/body/m_body295.pac
2696,player/m/body/m_body296.pac
2697,player/m/body/m_body297.pac
2698,player/m/body/m_body298.pac
2699,player/m/body/m_body299.pac
2700,player/m/body/m_body300.pac
2701,player/m/body/m_body301.pac
2702,player/m/body/m_body302.pac
2703,player/m/body/m_body303.pac
2704,player/m/body/m_body304.pac
2705,player/m/body/m_body305.pac
2706,player/m/body/m_body306.pac
2707,player/m/body/m_body307.pac
2708,player/m/body/m_body308.pac
2709,player/m/body/m_body309.pac
2710,player/m/body/m_body310.pac
2711,player/m/body/m_body311.pac
2712,player/m/body/m_body312.pac
2713,player/m/body/m_body313.pac
2714,player/m/body/m_body314.pac
2715,player/m/body/m_body315.pac
2716,player/m/body/m_body316.pac
2717,player/m/body/m_body317.pac
2718,player/m/body/m_body318.pac
2719,player/m/body/m_body319.pac
2720,player/m/body/m_body320.pac
2721,player/m/body/m_body321.pac
2722,player/m/body/m_body322.pac
2723,player/m/body/m_body323.pac
2724,player/m/body/m_body324.pac
2725,player/m/body/m_body325.pac
2726,player/m/body/m_body326.pac
2727,player/m/body/m_body327.pac
2728,player/m/body/m_body328.pac
2729,player/m/body/m_body329.pac
2730,player/m/body/m_body330.pac
2731,player/m/body/m_body331.pac
2732,player/m/body/m_body332.pac
2733,player/m/body/m_body333.pac
2734,player/m/body/m_body334.pac
2735,player/m/body/m_body335.pac
2736,player/m/body/m_body336.pac
2737,player/m/body/m_body337.pac
2738,player/m/body/m_body338.pac
2739,player/m/body/m_body339.pac
2740,player/m/body/m_body340.pac
2741,player/m/body/m_body341.pac
2742,player/m/arm/m_arm000.pac
2743,player/m/arm/m_arm001.pac
2744,player/m/arm/m_arm002.pac
2745,player/m/arm/m_arm003.pac
2746,player/m/arm/m_arm004.pac
2747,player/m/arm/m_arm005.pac
2748,player/m/arm/m_arm006.pac
2749,player/m/arm/m_arm007.pac
2750,player/m/arm/m_arm008.pac
2751,player/m/arm/m_arm009.pac
2752,player/m/arm/m_arm010.pac
2753,player/m/arm/m_arm011.pac
2754,player/m/arm/m_arm012.pac
2755,player/m/arm/m_arm013.pac
2756,player/m/arm/m_arm014.pac
2757,player/m/arm/m_arm015.pac
2758,player/m/arm/m_arm016.pac
2759,player/m/arm/m_arm017.pac
2760,player/m/arm/m_arm018.pac
2761,player/m/arm/m_arm019.pac
2762,player/m/arm/m_arm020.pac
2763,player/m/arm/m_arm021.pac
2764,player/m/arm/m_arm022.pac
2765,player/m/arm/m_arm023.pac
2766,player/m/arm/m_arm024.pac
2767,player/m/arm/m_arm025.pac
2768,player/m/arm/m_arm026.pac
2769,player/m/arm/m_arm027.pac
2770,player/m/arm/m_arm028.pac
2771,player/m/arm/m_arm029.pac
2772,player/m/arm/m_arm030.pac
2773,player/m/arm/m_arm031.pac
2774,player/m/arm/m_arm032.pac
2775,player/m/arm/m_arm033.pac
2776,player/m/arm/m_arm034.pac
2777,player/m/arm/m_arm035.pac
2778,player/m/arm/m_arm036.pac
2779,player/m/arm/m_arm037.pac
2780,player/m/arm/m_arm038.pac
2781,player/m/arm/m_arm039.pac
2782,player/m/arm/m_arm040.pac
2783,player/m/arm/m_arm041.pac
2784,player/m/arm/m_arm042.pac
2785,player/m/arm/m_arm043.pac
2786,player/m/arm/m_arm044.pac
2787,player/m/arm/m_arm045.pac
2788,player/m/arm/m_arm046.pac
2789,player/m/arm/m_arm047.pac
2790,player/m/arm/m_arm048.pac
2791,player/m/arm/m_arm049.pac
2792,player/m/arm/m_arm050.pac
2793,player/m/arm/m_arm051.pac
2794,player/m/arm/m_arm052.pac
2795,player/m/arm/m_arm053.pac
2796,player/m/arm/m_arm054.pac
2797,player/m/arm/m_arm055.pac
2798,player/m/arm/m_arm056.pac
2799,player/m/arm/m_arm057.pac
2800,player/m/arm/m_arm058.pac
2801,player/m/arm/m_arm059.pac
2802,player/m/arm/m_arm060.pac
2803,player/m/arm/m_arm061.pac
2804,player/m/arm/m_arm062.pac
2805,player/m/arm/m_arm063.pac
2806,player/m/arm/m_arm064.pac
2807,player/m/arm/m_arm065.pac
2808,player/m/arm/m_arm066.pac
2809,player/m/arm/m_arm067.pac
2810,player/m/arm/m_arm068.pac
2811,player/m/arm/m_arm069.pac
2812,player/m/arm/m_arm070.pac
2813,player/m/arm/m_arm071.pac
2814,player/m/arm/m_arm072.pac
2815,player/m/arm/m_arm073.pac
2816,player/m/arm/m_arm074.pac
2817,player/m/arm/m_arm075.pac
2818,player/m/arm/m_arm076.pac
2819,player/m/arm/m_arm077.pac
2820,player/m/arm/m_arm078.pac
2821,player/m/arm/m_arm079.pac
2822,player/m/arm/m_arm080.pac
2823,player/m/arm/m_arm081.pac
2824,player/m/arm/m_arm082.pac
2825,player/m/arm/m_arm083.pac
2826,player/m/arm/m_arm084.pac
2827,player/m/arm/m_arm085.pac
2828,player/m/arm/m_arm086.pac
2829,player/m/arm/m_arm087.pac
2830,player/m/arm/m_arm088.pac
2831,player/m/arm/m_arm089.pac
2832,player/m/arm/m_arm090.pac
2833,player/m/arm/m_arm091.pac
2834,player/m/arm/m_arm092.pac
2835,player/m/arm/m_arm093.pac
2836,player/m/arm/m_arm094.pac
2837,player/m/arm/m_arm095.pac
2838,player/m/arm/m_arm096.pac
2839,player/m/arm/m_arm097.pac
2840,player/m/arm/m_arm098.pac
2841,player/m/arm/m_arm099.pac
2842,player/m/arm/m_arm100.pac
2843,player/m/arm/m_arm101.pac
2844,player/m/arm/m_arm102.pac
2845,player/m/arm/m_arm103.pac
2846,player/m/arm/m_arm104.pac
2847,player/m/arm/m_arm105.pac
2848,player/m/arm/m_arm106.pac
2849,player/m/arm/m_arm107.pac
2850,player/m/arm/m_arm108.pac
2851,player/m/arm/m_arm109.pac
2852,player/m/arm/m_arm110.pac
2853,player/m/arm/m_arm111.pac
2854,player/m/arm/m_arm112.pac
2855,player/m/arm/m_arm113.pac
2856,player/m/arm/m_arm114.pac
2857,player/m/arm/m_arm115.pac
2858,player/m/arm/m_arm116.pac
2859,player/m/arm/m_arm117.pac
2860,player/m/arm/m_arm118.pac
2861,player/m/arm/m_arm119.pac
2862,player/m/arm/m_arm120.pac
2863,player/m/arm/m_arm121.pac
2864,player/m/arm/m_arm122.pac
2865,player/m/arm/m_arm123.pac
2866,player/m/arm/m_arm124.pac
2867,player/m/arm/m_arm125.pac
2868,player/m/arm/m_arm126.pac
2869,player/m/arm/m_arm127.pac
2870,player/m/arm/m_arm128.pac
2871,player/m/arm/m_arm129.pac
2872,player/m/arm/m_arm130.pac
2873,player/m/arm/m_arm131.pac
2874,player/m/arm/m_arm132.pac
2875,player/m/arm/m_arm133.pac
2876,player/m/arm/m_arm134.pac
2877,player/m/arm/m_arm135.pac
2878,player/m/arm/m_arm136.pac
2879,player/m/arm/m_arm137.pac
2880,player/m/arm/m_arm138.pac
2881,player/m/arm/m_arm139.pac
2882,player/m/arm/m_arm140.pac
2883,player/m/arm/m_arm141.pac
2884,player/m/arm/m_arm142.pac
2885,player/m/arm/m_arm143.pac
2886,player/m/arm/m_arm144.pac
2887,player/m/arm/m_arm145.pac
2888,player/m/arm/m_arm146.pac
2889,player/m/arm/m_arm147.pac
2890,player/m/arm/m_arm148.pac
2891,player/m/arm/m_arm149.pac
2892,player/m/arm/m_arm150.pac
2893,player/m/arm/m_arm151.pac
2894,player/m/arm/m_arm152.pac
2895,player/m/arm/m_arm153.pac
2896,player/m/arm/m_arm154.pac
2897,player/m/arm/m_arm155.pac
2898,player/m/arm/m_arm156.pac
2899,player/m/arm/m_arm157.pac
2900,player/m/arm/m_arm158.pac
2901,player/m/arm/m_arm159.pac
2902,player/m/arm/m_arm160.pac
2903,player/m/arm/m_arm161.pac
2904,player/m/arm/m_arm162.pac
2905,player/m/arm/m_arm163.pac
2906,player/m/arm/m_arm164.pac
2907,player/m/arm/m_arm165.pac
2908,player/m/arm/m_arm166.pac
2909,player/m/arm/m_arm167.pac
2910,player/m/arm/m_arm168.pac
2911,player/m/arm/m_arm169.pac
2912,player/m/arm/m_arm170.pac
2913,player/m/arm/m_arm171.pac
2914,player/m/arm/m_arm172.pac
2915,player/m/arm/m_arm173.pac
2916,player/m/arm/m_arm174.pac
2917,player/m/arm/m_arm175.pac
2918,player/m/arm/m_arm176.pac
2919,player/m/arm/m_arm177.pac
2920,player/m/arm/m_arm178.pac
2921,player/m/arm/m_arm179.pac
2922,player/m/arm/m_arm180.pac
2923,player/m/arm/m_arm181.pac
2924,player/m/arm/m_arm182.pac
2925,player/m/arm/m_arm183.pac
2926,player/m/arm/m_arm184.pac
2927,player/m/arm/m_arm185.pac
2928,player/m/arm/m_arm186.pac
2929,player/m/arm/m_arm187.pac
2930,player/m/arm/m_arm188.pac
2931,player/m/arm/m_arm189.pac
2932,player/m/arm/m_arm190.pac
2933,player/m/arm/m_arm191.pac
2934,player/m/arm/m_arm192.pac
2935,player/m/arm/m_arm193.pac
2936,player/m/arm/m_arm194.pac
2937,player/m/arm/m_arm195.pac
2938,player/m/arm/m_arm196.pac
2939,player/m/arm/m_arm197.pac
2940,player/m/arm/m_arm198.pac
2941,player/m/arm/m_arm199.pac
2942,player/m/arm/m_arm200.pac
2943,player/m/arm/m_arm201.pac
2944,player/m/arm/m_arm202.pac
2945,player/m/arm/m_arm203.pac
2946,player/m/arm/m_arm204.pac
2947,player/m/arm/m_arm205.pac
2948,player/m/arm/m_arm206.pac
2949,player/m/arm/m_arm207.pac
2950,player/m/arm/m_arm208.pac
2951,player/m/arm/m_arm209.pac
2952,player/m/arm/m_arm210.pac
2953,player/m/arm/m_arm211.pac
2954,player/m/arm/m_arm212.pac
2955,player/m/arm/m_arm213.pac
2956,player/m/arm/m_arm214.pac
2957,player/m/arm/m_arm215.pac
2958,player/m/arm/m_arm216.pac
2959,player/m/arm/m_arm217.pac
2960,player/m/arm/m_arm218.pac
2961,player/m/arm/m_arm219.pac
2962,player/m/arm/m_arm220.pac
2963,player/m/arm/m_arm221.pac
2964,player/m/arm/m_arm222.pac
2965,player/m/arm/m_arm223.pac
2966,player/m/arm/m_arm224.pac
2967,player/m/arm/m_arm225.pac
2968,player/m/arm/m_arm226.pac
2969,player/m/arm/m_arm227.pac
2970,player/m/arm/m_arm228.pac
2971,player/m/arm/m_arm229.pac
2972,player/m/arm/m_arm230.pac
2973,player/m/arm/m_arm231.pac
2974,player/m/arm/m_arm232.pac
2975,player/m/arm/m_arm233.pac
2976,player/m/arm/m_arm234.pac
2977,player/m/arm/m_arm235.pac
2978,player/m/arm/m_arm236.pac
2979,player/m/arm/m_arm237.pac
2980,player/m/arm/m_arm238.pac
2981,player/m/arm/m_arm239.pac
2982,player/m/arm/m_arm240.pac
2983,player/m/arm/m_arm241.pac
2984,player/m/arm/m_arm242.pac
2985,player/m/arm/m_arm243.pac
2986,player/m/arm/m_arm244.pac
2987,player/m/arm/m_arm245.pac
2988,player/m/arm/m_arm246.pac
2989,player/m/arm/m_arm247.pac
2990,player/m/arm/m_arm248.pac
2991,player/m/arm/m_arm249.pac
2992,player/m/arm/m_arm250.pac
2993,player/m/arm/m_arm251.pac
2994,player/m/arm/m_arm252.pac
2995,player/m/arm/m_arm253.pac
2996,player/m/arm/m_arm254.pac
2997,player/m/arm/m_arm255.pac
2998,player/m/arm/m_arm256.pac
2999,player/m/arm/m_arm257.pac
3000,player/m/arm/m_arm258.pac
3001,player/m/arm/m_arm259.pac
3002,player/m/arm/m_arm260.pac
3003,player/m/arm/m_arm261.pac
3004,player/m/arm/m_arm262.pac
3005,player/m/arm/m_arm263.pac
3006,player/m/arm/m_arm264.pac
3007,player/m/arm/m_arm265.pac
3008,player/m/arm/m_arm266.pac
3009,player/m/arm/m_arm267.pac
3010,player/m/arm/m_arm268.pac
3011,player/m/arm/m_arm269.pac
3012,player/m/arm/m_arm270.pac
3013,player/m/arm/m_arm271.pac
3014,player/m/arm/m_arm272.pac
3015,player/m/arm/m_arm273.pac
3016,player/m/arm/m_arm274.pac
3017,player/m/arm/m_arm275.pac
3018,player/m/arm/m_arm276.pac
3019,player/m/arm/m_arm277.pac
3020,player/m/arm/m_arm278.pac
3021,player/m/arm/m_arm279.pac
3022,player/m/arm/m_arm280.pac
3023,player/m/arm/m_arm281.pac
3024,player/m/arm/m_arm282.pac
3025,player/m/arm/m_arm283.pac
3026,player/m/arm/m_arm284.pac
3027,player/m/arm/m_arm285.pac
3028,player/m/arm/m_arm286.pac
3029,player/m/arm/m_arm287.pac
3030,player/m/arm/m_arm288.pac
3031,player/m/arm/m_arm289.pac
3032,player/m/arm/m_arm290.pac
3033,player/m/arm/m_arm291.pac
3034,player/m/arm/m_arm292.pac
3035,player/m/arm/m_arm293.pac
3036,player/m/arm/m_arm294.pac
3037,player/m/arm/m_arm295.pac
3038,player/m/arm/m_arm296.pac
3039,player/m/arm/m_arm297.pac
3040,player/m/arm/m_arm298.pac
3041,player/m/arm/m_arm299.pac
3042,player/m/arm/m_arm300.pac
3043,player/m/arm/m_arm301.pac
3044,player/m/arm/m_arm302.pac
3045,player/m/arm/m_arm303.pac
3046,player/m/arm/m_arm304.pac
3047,player/m/arm/m_arm305.pac
3048,player/m/arm/m_arm306.pac
3049,player/m/arm/m_arm307.pac
3050,player/m/arm/m_arm308.pac
3051,player/m/arm/m_arm309.pac
3052,player/m/arm/m_arm310.pac
3053,player/m/arm/m_arm311.pac
3054,player/m/arm/m_arm312.pac
3055,player/m/arm/m_arm313.pac
3056,player/m/arm/m_arm314.pac
3057,player/m/arm/m_arm315.pac
3058,player/m/arm/m_arm316.pac
3059,player/m/arm/m_arm317.pac
3060,player/m/arm/m_arm318.pac
3061,player/m/arm/m_arm319.pac
3062,player/m/arm/m_arm320.pac
3063,player/m/arm/m_arm321.pac
3064,player/m/arm/m_arm322.pac
3065,player/m/arm/m_arm323.pac
3066,player/m/arm/m_arm324.pac
3067,player/m/arm/m_arm325.pac
3068,player/m/arm/m_arm326.pac
3069,player/m/arm/m_arm327.pac
3070,player/m/arm/m_arm328.pac
3071,player/m/arm/m_arm329.pac
3072,player/m/arm/m_arm330.pac
3073,player/m/arm/m_arm331.pac
3074,player/m/arm/m_arm332.pac
3075,player/m/arm/m_arm333.pac
3076,player/m/arm/m_arm334.pac
3077,player/m/arm/m_arm335.pac
3078,player/m/arm/m_arm336.pac
3079,player/m/arm/m_arm337.pac
3080,player/m/wst/m_wst000.pac
3081,player/m/wst/m_wst001.pac
3082,player/m/wst/m_wst002.pac
3083,player/m/wst/m_wst003.pac
3084,player/m/wst/m_wst004.pac
3085,player/m/wst/m_wst005.pac
3086,player/m/wst/m_wst006.pac
3087,player/m/wst/m_wst007.pac
3088,player/m/wst/m_wst008.pac
3089,player/m/wst/m_wst009.pac
3090,player/m/wst/m_wst010.pac
3091,player/m/wst/m_wst011.pac
3092,player/m/wst/m_wst012.pac
3093,player/m/wst/m_wst013.pac
3094,player/m/wst/m_wst014.pac
3095,player/m/wst/m_wst015.pac
3096,player/m/wst/m_wst016.pac
3097,player/m/wst/m_wst017.pac
3098,player/m/wst/m_wst018.pac
3099,player/m/wst/m_wst019.pac
3100,player/m/wst/m_wst020.pac
3101,player/m/wst/m_wst021.pac
3102,player/m/wst/m_wst022.pac
3103,player/m/wst/m_wst023.pac
3104,player/m/wst/m_wst024.pac
3105,player/m/wst/m_wst025.pac
3106,player/m/wst/m_wst026.pac
3107,player/m/wst/m_wst027.pac
3108,player/m/wst/m_wst028.pac
3109,player/m/wst/m_wst029.pac
3110,player/m/wst/m_wst030.pac
3111,player/m/wst/m_wst031.pac
3112,player/m/wst/m_wst032.pac
3113,player/m/wst/m_wst033.pac
3114,player/m/wst/m_wst034.pac
3115,player/m/wst/m_wst035.pac
3116,player/m/wst/m_wst036.pac
3117,player/m/wst/m_wst037.pac
3118,player/m/wst/m_wst038.pac
3119,player/m/wst/m_wst039.pac
3120,player/m/wst/m_wst040.pac
3121,player/m/wst/m_wst041.pac
3122,player/m/wst/m_wst042.pac
3123,player/m/wst/m_wst043.pac
3124,player/m/wst/m_wst044.pac
3125,player/m/wst/m_wst045.pac
3126,player/m/wst/m_wst046.pac
3127,player/m/wst/m_wst047.pac
3128,player/m/wst/m_wst048.pac
3129,player/m/wst/m_wst049.pac
3130,player/m/wst/m_wst050.pac
3131,player/m/wst/m_wst051.pac
3132,player/m/wst/m_wst052.pac
3133,player/m/wst/m_wst053.pac
3134,player/m/wst/m_wst054.pac
3135,player/m/wst/m_wst055.pac
3136,player/m/wst/m_wst056.pac
3137,player/m/wst/m_wst057.pac
3138,player/m/wst/m_wst058.pac
3139,player/m/wst/m_wst059.pac
3140,player/m/wst/m_wst060.pac
3141,player/m/wst/m_wst061.pac
3142,player/m/wst/m_wst062.pac
3143,player/m/wst/m_wst063.pac
3144,player/m/wst/m_wst064.pac
3145,player/m/wst/m_wst065.pac
3146,player/m/wst/m_wst066.pac
3147,player/m/wst/m_wst067.pac
3148,player/m/wst/m_wst068.pac
3149,player/m/wst/m_wst069.pac
3150,player/m/wst/m_wst070.pac
3151,player/m/wst/m_wst071.pac
3152,player/m/wst/m_wst072.pac
3153,player/m/wst/m_wst073.pac
3154,player/m/wst/m_wst074.pac
3155,player/m/wst/m_wst075.pac
3156,player/m/wst/m_wst076.pac
3157,player/m/wst/m_wst077.pac
3158,player/m/wst/m_wst078.pac
3159,player/m/wst/m_wst079.pac
3160,player/m/wst/m_wst080.pac
3161,player/m/wst/m_wst081.pac
3162,player/m/wst/m_wst082.pac
3163,player/m/wst/m_wst083.pac
3164,player/m/wst/m_wst084.pac
3165,player/m/wst/m_wst085.pac
3166,player/m/wst/m_wst086.pac
3167,player/m/wst/m_wst087.pac
3168,player/m/wst/m_wst088.pac
3169,player/m/wst/m_wst089.pac
3170,player/m/wst/m_wst090.pac
3171,player/m/wst/m_wst091.pac
3172,player/m/wst/m_wst092.pac
3173,player/m/wst/m_wst093.pac
3174,player/m/wst/m_wst094.pac
3175,player/m/wst/m_wst095.pac
3176,player/m/wst/m_wst096.pac
3177,player/m/wst/m_wst097.pac
3178,player/m/wst/m_wst098.pac
3179,player/m/wst/m_wst099.pac
3180,player/m/wst/m_wst100.pac
3181,player/m/wst/m_wst101.pac
3182,player/m/wst/m_wst102.pac
3183,player/m/wst/m_wst103.pac
3184,player/m/wst/m_wst104.pac
3185,player/m/wst/m_wst105.pac
3186,player/m/wst/m_wst106.pac
3187,player/m/wst/m_wst107.pac
3188,player/m/wst/m_wst108.pac
3189,player/m/wst/m_wst109.pac
3190,player/m/wst/m_wst110.pac
3191,player/m/wst/m_wst111.pac
3192,player/m/wst/m_wst112.pac
3193,player/m/wst/m_wst113.pac
3194,player/m/wst/m_wst114.pac
3195,player/m/wst/m_wst115.pac
3196,player/m/wst/m_wst116.pac
3197,player/m/wst/m_wst117.pac
3198,player/m/wst/m_wst118.pac
3199,player/m/wst/m_wst119.pac
3200,player/m/wst/m_wst120.pac
3201,player/m/wst/m_wst121.pac
3202,player/m/wst/m_wst122.pac
3203,player/m/wst/m_wst123.pac
3204,player/m/wst/m_wst124.pac
3205,player/m/wst/m_wst125.pac
3206,player/m/wst/m_wst126.pac
3207,player/m/wst/m_wst127.pac
3208,player/m/wst/m_wst128.pac
3209,player/m/wst/m_wst129.pac
3210,player/m/wst/m_wst130.pac
3211,player/m/wst/m_wst131.pac
3212,player/m/wst/m_wst132.pac
3213,player/m/wst/m_wst133.pac
3214,player/m/wst/m_wst134.pac
3215,player/m/wst/m_wst135.pac
3216,player/m/wst/m_wst136.pac
3217,player/m/wst/m_wst137.pac
3218,player/m/wst/m_wst138.pac
3219,player/m/wst/m_wst139.pac
3220,player/m/wst/m_wst140.pac
3221,player/m/wst/m_wst141.pac
3222,player/m/wst/m_wst142.pac
3223,player/m/wst/m_wst143.pac
3224,player/m/wst/m_wst144.pac
3225,player/m/wst/m_wst145.pac
3226,player/m/wst/m_wst146.pac
3227,player/m/wst/m_wst147.pac
3228,player/m/wst/m_wst148.pac
3229,player/m/wst/m_wst149.pac
3230,player/m/wst/m_wst150.pac
3231,player/m/wst/m_wst151.pac
3232,player/m/wst/m_wst152.pac
3233,player/m/wst/m_wst153.pac
3234,player/m/wst/m_wst154.pac
3235,player/m/wst/m_wst155.pac
3236,player/m/wst/m_wst156.pac
3237,player/m/wst/m_wst157.pac
3238,player/m/wst/m_wst158.pac
3239,player/m/wst/m_wst159.pac
3240,player/m/wst/m_wst160.pac
3241,player/m/wst/m_wst161.pac
3242,player/m/wst/m_wst162.pac
3243,player/m/wst/m_wst163.pac
3244,player/m/wst/m_wst164.pac
3245,player/m/wst/m_wst165.pac
3246,player/m/wst/m_wst166.pac
3247,player/m/wst/m_wst167.pac
3248,player/m/wst/m_wst168.pac
3249,player/m/wst/m_wst169.pac
3250,player/m/wst/m_wst170.pac
3251,player/m/wst/m_wst171.pac
3252,player/m/wst/m_wst172.pac
3253,player/m/wst/m_wst173.pac
3254,player/m/wst/m_wst174.pac
3255,player/m/wst/m_wst175.pac
3256,player/m/wst/m_wst176.pac
3257,player/m/wst/m_wst177.pac
3258,player/m/wst/m_wst178.pac
3259,player/m/wst/m_wst179.pac
3260,player/m/wst/m_wst180.pac
3261,player/m/wst/m_wst181.pac
3262,player/m/wst/m_wst182.pac
3263,player/m/wst/m_wst183.pac
3264,player/m/wst/m_wst184.pac
3265,player/m/wst/m_wst185.pac
3266,player/m/wst/m_wst186.pac
3267,player/m/wst/m_wst187.pac
3268,player/m/wst/m_wst188.pac
3269,player/m/wst/m_wst189.pac
3270,player/m/wst/m_wst190.pac
3271,player/m/wst/m_wst191.pac
3272,player/m/wst/m_wst192.pac
3273,player/m/wst/m_wst193.pac
3274,player/m/wst/m_wst194.pac
3275,player/m/wst/m_wst195.pac
3276,player/m/wst/m_wst196.pac
3277,player/m/wst/m_wst197.pac
3278,player/m/wst/m_wst198.pac
3279,player/m/wst/m_wst199.pac
3280,player/m/wst/m_wst200.pac
3281,player/m/wst/m_wst201.pac
3282,player/m/wst/m_wst202.pac
3283,player/m/wst/m_wst203.pac
3284,player/m/wst/m_wst204.pac
3285,player/m/wst/m_wst205.pac
3286,player/m/wst/m_wst206.pac
3287,player/m/wst/m_wst207.pac
3288,player/m/wst/m_wst208.pac
3289,player/m/wst/m_wst209.pac
3290,player/m/wst/m_wst210.pac
3291,player/m/wst/m_wst211.pac
3292,player/m/wst/m_wst212.pac
3293,player/m/wst/m_wst213.pac
3294,player/m/wst/m_wst214.pac
3295,player/m/wst/m_wst215.pac
3296,player/m/wst/m_wst216.pac
3297,player/m/wst/m_wst217.pac
3298,player/m/wst/m_wst218.pac
3299,player/m/wst/m_wst219.pac
3300,player/m/wst/m_wst220.pac
3301,player/m/wst/m_wst221.pac
3302,player/m/wst/m_wst222.pac
3303,player/m/wst/m_wst223.pac
3304,player/m/wst/m_wst224.pac
3305,player/m/wst/m_wst225.pac
3306,player/m/wst/m_wst226.pac
3307,player/m/wst/m_wst227.pac
3308,player/m/wst/m_wst228.pac
3309,player/m/wst/m_wst229.pac
3310,player/m/wst/m_wst230.pac
3311,player/m/wst/m_wst231.pac
3312,player/m/wst/m_wst232.pac
3313,player/m/wst/m_wst233.pac
3314,player/m/wst/m_wst234.pac
3315,player/m/wst/m_wst235.pac
3316,player/m/wst/m_wst236.pac
3317,player/m/wst/m_wst237.pac
3318,player/m/wst/m_wst238.pac
3319,player/m/wst/m_wst239.pac
3320,player/m/wst/m_wst240.pac
3321,player/m/wst/m_wst241.pac
3322,player/m/wst/m_wst242.pac
3323,player/m/wst/m_wst243.pac
3324,player/m/wst/m_wst244.pac
3325,player/m/wst/m_wst245.pac
3326,player/m/wst/m_wst246.pac
3327,player/m/wst/m_wst247.pac
3328,player/m/wst/m_wst248.pac
3329,player/m/wst/m_wst249.pac
3330,player/m/wst/m_wst250.pac
3331,player/m/wst/m_wst251.pac
3332,player/m/wst/m_wst252.pac
3333,player/m/wst/m_wst253.pac
3334,player/m/wst/m_wst254.pac
3335,player/m/wst/m_wst255.pac
3336,player/m/wst/m_wst256.pac
3337,player/m/wst/m_wst257.pac
3338,player/m/wst/m_wst258.pac
3339,player/m/wst/m_wst259.pac
3340,player/m/wst/m_wst260.pac
3341,player/m/wst/m_wst261.pac
3342,player/m/wst/m_wst262.pac
3343,player/m/wst/m_wst263.pac
3344,player/m/wst/m_wst264.pac
3345,player/m/wst/m_wst265.pac
3346,player/m/wst/m_wst266.pac
3347,player/m/wst/m_wst267.pac
3348,player/m/wst/m_wst268.pac
3349,player/m/wst/m_wst269.pac
3350,player/m/wst/m_wst270.pac
3351,player/m/wst/m_wst271.pac
3352,player/m/wst/m_wst272.pac
3353,player/m/wst/m_wst273.pac
3354,player/m/wst/m_wst274.pac
3355,player/m/wst/m_wst275.pac
3356,player/m/wst/m_wst276.pac
3357,player/m/wst/m_wst277.pac
3358,player/m/wst/m_wst278.pac
3359,player/m/wst/m_wst279.pac
3360,player/m/wst/m_wst280.pac
3361,player/m/wst/m_wst281.pac
3362,player/m/wst/m_wst282.pac
3363,player/m/wst/m_wst283.pac
3364,player/m/wst/m_wst284.pac
3365,player/m/wst/m_wst285.pac
3366,player/m/wst/m_wst286.pac
3367,player/m/wst/m_wst287.pac
3368,player/m/wst/m_wst288.pac
3369,player/m/wst/m_wst289.pac
3370,player/m/wst/m_wst290.pac
3371,player/m/wst/m_wst291.pac
3372,player/m/wst/m_wst292.pac
3373,player/m/wst/m_wst293.pac
3374,player/m/wst/m_wst294.pac
3375,player/m/wst/m_wst295.pac
3376,player/m/wst/m_wst296.pac
3377,motion/w00_tbl.bin
3378,motion/w01_tbl.bin
3379,motion/w02_tbl.bin
3380,motion/w03_tbl.bin
3381,motion/w04_tbl.bin
3382,motion/w05_tbl.bin
3383,motion/w06_tbl.bin
3384,motion/w07_tbl.bin
3385,motion/w08_tbl.bin
3386,motion/w09_tbl.bin
3387,motion/w10_tbl.bin
3388,weapon/we000.pac
3389,weapon/we001.pac
3390,weapon/we002.pac
3391,weapon/we003.pac
3392,weapon/we004.pac
3393,weapon/we005.pac
3394,weapon/we006.pac
3395,weapon/we007.pac
3396,weapon/we008.pac
3397,weapon/we009.pac
3398,weapon/we010.pac
3399,weapon/we011.pac
3400,weapon/we012.pac
3401,weapon/we013.pac
3402,weapon/we014.pac
3403,weapon/we015.pac
3404,weapon/we016.pac
3405,weapon/we017.pac
3406,weapon/we018.pac
3407,weapon/we019.pac
3408,weapon/we020.pac
3409,weapon/we021.pac
3410,weapon/we022.pac
3411,weapon/we023.pac
3412,weapon/we024.pac
3413,weapon/we025.pac
3414,weapon/we026.pac
3415,weapon/we027.pac
3416,weapon/we028.pac
3417,weapon/we029.pac
3418,weapon/we030.pac
3419,weapon/we031.pac
3420,weapon/we032.pac
3421,weapon/we033.pac
3422,weapon/we034.pac
3423,weapon/we035.pac
3424,weapon/we036.pac
3425,weapon/we037.pac
3426,weapon/we038.pac
3427,weapon/we039.pac
3428,weapon/we040.pac
3429,weapon/we041.pac
3430,weapon/we042.pac
3431,weapon/we043.pac
3432,weapon/we044.pac
3433,weapon/we045.pac
3434,weapon/we046.pac
3435,weapon/we047.pac
3436,weapon/we048.pac
3437,weapon/we049.pac
3438,weapon/we050.pac
3439,weapon/we051.pac
3440,weapon/we052.pac
3441,weapon/we053.pac
3442,weapon/we054.pac
3443,weapon/we055.pac
3444,weapon/we056.pac
3445,weapon/we057.pac
3446,weapon/we058.pac
3447,weapon/we059.pac
3448,weapon/we060.pac
3449,weapon/we061.pac
3450,weapon/we062.pac
3451,weapon/we063.pac
3452,weapon/we064.pac
3453,weapon/we065.pac
3454,weapon/we066.pac
3455,weapon/we067.pac
3456,weapon/we068.pac
3457,weapon/we069.pac
3458,weapon/we070.pac
3459,weapon/we071.pac
3460,weapon/we072.pac
3461,weapon/we073.pac
3462,weapon/we074.pac
3463,weapon/we075.pac
3464,weapon/we076.pac
3465,weapon/we077.pac
3466,weapon/we078.pac
3467,weapon/we079.pac
3468,weapon/we080.pac
3469,weapon/we081.pac
3470,weapon/we082.pac
3471,weapon/we083.pac
3472,weapon/we084.pac
3473,weapon/we085.pac
3474,weapon/we086.pac
3475,weapon/we087.pac
3476,weapon/we088.pac
3477,weapon/we089.pac
3478,weapon/we090.pac
3479,weapon/we091.pac
3480,weapon/we092.pac
3481,weapon/we093.pac
3482,weapon/we094.pac
3483,weapon/we095.pac
3484,weapon/we096.pac
3485,weapon/we097.pac
3486,weapon/we098.pac
3487,weapon/we099.pac
3488,weapon/we100.pac
3489,weapon/we101.pac
3490,weapon/we102.pac
3491,weapon/we103.pac
3492,weapon/we104.pac
3493,weapon/we105.pac
3494,weapon/we106.pac
3495,weapon/we107.pac
3496,weapon/we108.pac
3497,weapon/we109.pac
3498,weapon/we110.pac
3499,weapon/we111.pac
3500,weapon/we112.pac
3501,weapon/we113.pac
3502,weapon/we114.pac
3503,weapon/we115.pac
3504,weapon/we116.pac
3505,weapon/we117.pac
3506,weapon/we118.pac
3507,weapon/we119.pac
3508,weapon/we120.pac
3509,weapon/we121.pac
3510,weapon/we122.pac
3511,weapon/we123.pac
3512,weapon/we124.pac
3513,weapon/we125.pac
3514,weapon/we126.pac
3515,weapon/we127.pac
3516,weapon/we128.pac
3517,weapon/we129.pac
3518,weapon/we130.pac
3519,weapon/we131.pac
3520,weapon/we132.pac
3521,weapon/we133.pac
3522,weapon/we134.pac
3523,weapon/we135.pac
3524,weapon/we136.pac
3525,weapon/we137.pac
3526,weapon/we138.pac
3527,weapon/we139.pac
3528,weapon/we140.pac
3529,weapon/we141.pac
3530,weapon/we142.pac
3531,weapon/we143.pac
3532,weapon/we144.pac
3533,weapon/we145.pac
3534,weapon/we146.pac
3535,weapon/we147.pac
3536,weapon/we148.pac
3537,weapon/we149.pac
3538,weapon/we150.pac
3539,weapon/we151.pac
3540,weapon/we152.pac
3541,weapon/we153.pac
3542,weapon/we154.pac
3543,weapon/we155.pac
3544,weapon/we156.pac
3545,weapon/we157.pac
3546,weapon/we158.pac
3547,weapon/we159.pac
3548,weapon/we160.pac
3549,weapon/we161.pac
3550,weapon/we162.pac
3551,weapon/we163.pac
3552,weapon/we164.pac
3553,weapon/we165.pac
3554,weapon/we166.pac
3555,weapon/we167.pac
3556,weapon/we168.pac
3557,weapon/we169.pac
3558,weapon/we170.pac
3559,weapon/we171.pac
3560,weapon/we172.pac
3561,weapon/we173.pac
3562,weapon/we174.pac
3563,weapon/we175.pac
3564,weapon/we176.pac
3565,weapon/we177.pac
3566,weapon/we178.pac
3567,weapon/we179.pac
3568,weapon/we180.pac
3569,weapon/we181.pac
3570,weapon/we182.pac
3571,weapon/we183.pac
3572,weapon/we184.pac
3573,weapon/we185.pac
3574,weapon/we186.pac
3575,weapon/we187.pac
3576,weapon/we188.pac
3577,weapon/we189.pac
3578,weapon/we190.pac
3579,weapon/we191.pac
3580,weapon/we192.pac
3581,weapon/we193.pac
3582,weapon/we194.pac
3583,weapon/we195.pac
3584,weapon/we196.pac
3585,weapon/we197.pac
3586,weapon/we198.pac
3587,weapon/we199.pac
3588,weapon/we200.pac
3589,weapon/we201.pac
3590,weapon/we202.pac
3591,weapon/we203.pac
3592,weapon/we204.pac
3593,weapon/we205.pac
3594,weapon/we206.pac
3595,weapon/we207.pac
3596,weapon/we208.pac
3597,weapon/we209.pac
3598,weapon/we210.pac
3599,weapon/we211.pac
3600,weapon/we212.pac
3601,weapon/we213.pac
3602,weapon/we214.pac
3603,weapon/we215.pac
3604,weapon/we216.pac
3605,weapon/we217.pac
3606,weapon/we218.pac
3607,weapon/we219.pac
3608,weapon/we220.pac
3609,weapon/we221.pac
3610,weapon/we222.pac
3611,weapon/we223.pac
3612,weapon/we224.pac
3613,weapon/we225.pac
3614,weapon/we226.pac
3615,weapon/we227.pac
3616,weapon/we228.pac
3617,weapon/we229.pac
3618,weapon/we230.pac
3619,weapon/we231.pac
3620,weapon/we232.pac
3621,weapon/we233.pac
3622,weapon/we234.pac
3623,weapon/we235.pac
3624,weapon/we236.pac
3625,weapon/we237.pac
3626,weapon/we238.pac
3627,weapon/we239.pac
3628,weapon/we240.pac
3629,weapon/we241.pac
3630,weapon/we242.pac
3631,weapon/we243.pac
3632,weapon/we244.pac
3633,weapon/we245.pac
3634,weapon/we246.pac
3635,weapon/we247.pac
3636,weapon/we248.pac
3637,weapon/we249.pac
3638,weapon/we250.pac
3639,weapon/we251.pac
3640,weapon/we252.pac
3641,weapon/we253.pac
3642,weapon/we254.pac
3643,weapon/we255.pac
3644,weapon/we256.pac
3645,weapon/we257.pac
3646,weapon/we258.pac
3647,weapon/we259.pac
3648,weapon/we260.pac
3649,weapon/we261.pac
3650,weapon/we262.pac
3651,weapon/we263.pac
3652,weapon/we264.pac
3653,weapon/we265.pac
3654,weapon/we266.pac
3655,weapon/we267.pac
3656,weapon/we268.pac
3657,weapon/we269.pac
3658,weapon/we270.pac
3659,weapon/we271.pac
3660,weapon/we272.pac
3661,weapon/we273.pac
3662,weapon/we274.pac
3663,weapon/we275.pac
3664,weapon/we276.pac
3665,weapon/we277.pac
3666,weapon/we278.pac
3667,weapon/we279.pac
3668,weapon/we280.pac
3669,weapon/we281.pac
3670,weapon/we282.pac
3671,weapon/we283.pac
3672,weapon/we284.pac
3673,weapon/we285.pac
3674,weapon/we286.pac
3675,weapon/we287.pac
3676,weapon/we288.pac
3677,weapon/we289.pac
3678,weapon/we290.pac
3679,weapon/we291.pac
3680,weapon/we292.pac
3681,weapon/we293.pac
3682,weapon/we294.pac
3683,weapon/we295.pac
3684,weapon/we296.pac
3685,weapon/we297.pac
3686,weapon/we298.pac
3687,weapon/we299.pac
3688,weapon/we300.pac
3689,weapon/we301.pac
3690,weapon/we302.pac
3691,weapon/we303.pac
3692,weapon/we304.pac
3693,weapon/we305.pac
3694,weapon/we306.pac
3695,weapon/we307.pac
3696,weapon/we308.pac
3697,weapon/we309.pac
3698,weapon/we310.pac
3699,weapon/we311.pac
3700,weapon/we312.pac
3701,weapon/we313.pac
3702,weapon/we314.pac
3703,weapon/we315.pac
3704,weapon/we316.pac
3705,weapon/we317.pac
3706,weapon/we318.pac
3707,weapon/we319.pac
3708,weapon/we320.pac
3709,weapon/we321.pac
3710,weapon/we322.pac
3711,weapon/we323.pac
3712,weapon/we324.pac
3713,weapon/we325.pac
3714,weapon/we326.pac
3715,weapon/we327.pac
3716,weapon/we328.pac
3717,weapon/we329.pac
3718,weapon/we330.pac
3719,weapon/we331.pac
3720,weapon/we332.pac
3721,weapon/we333.pac
3722,weapon/we334.pac
3723,weapon/we335.pac
3724,weapon/we336.pac
3725,weapon/we337.pac
3726,weapon/we338.pac
3727,weapon/we339.pac
3728,weapon/we340.pac
3729,weapon/we341.pac
3730,weapon/we342.pac
3731,weapon/we343.pac
3732,weapon/we344.pac
3733,weapon/we345.pac
3734,weapon/we346.pac
3735,weapon/we347.pac
3736,weapon/we348.pac
3737,weapon/we349.pac
3738,weapon/we350.pac
3739,weapon/we351.pac
3740,weapon/we352.pac
3741,weapon/we353.pac
3742,weapon/we354.pac
3743,weapon/we355.pac
3744,weapon/we356.pac
3745,weapon/we357.pac
3746,weapon/we358.pac
3747,weapon/we359.pac
3748,weapon/we360.pac
3749,weapon/we361.pac
3750,weapon/we362.pac
3751,weapon/we363.pac
3752,weapon/we364.pac
3753,weapon/we365.pac
3754,weapon/we366.pac
3755,weapon/we367.pac
3756,weapon/we368.pac
3757,weapon/we369.pac
3758,weapon/we370.pac
3759,weapon/we371.pac
3760,weapon/we372.pac
3761,weapon/we373.pac
3762,weapon/we374.pac
3763,weapon/we375.pac
3764,weapon/we376.pac
3765,weapon/we377.pac
3766,weapon/we378.pac
3767,weapon/we379.pac
3768,weapon/we380.pac
3769,weapon/we381.pac
3770,weapon/we382.pac
3771,weapon/we383.pac
3772,weapon/we384.pac
3773,weapon/we385.pac
3774,weapon/we386.pac
3775,weapon/we387.pac
3776,weapon/we388.pac
3777,weapon/we389.pac
3778,weapon/we390.pac
3779,weapon/we391.pac
3780,weapon/we392.pac
3781,weapon/we393.pac
3782,weapon/we394.pac
3783,weapon/we395.pac
3784,weapon/we396.pac
3785,weapon/we397.pac
3786,weapon/we398.pac
3787,weapon/we399.pac
3788,weapon/we400.pac
3789,weapon/we401.pac
3790,weapon/we402.pac
3791,weapon/we403.pac
3792,weapon/we404.pac
3793,weapon/we405.pac
3794,weapon/we406.pac
3795,weapon/we407.pac
3796,weapon/we408.pac
3797,weapon/we409.pac
3798,weapon/we410.pac
3799,weapon/we411.pac
3800,weapon/we412.pac
3801,weapon/we413.pac
3802,weapon/we414.pac
3803,weapon/we415.pac
3804,weapon/we416.pac
3805,weapon/we417.pac
3806,weapon/we418.pac
3807,weapon/we419.pac
3808,weapon/we420.pac
3809,weapon/we421.pac
3810,weapon/we422.pac
3811,weapon/we423.pac
3812,weapon/we424.pac
3813,weapon/we425.pac
3814,weapon/we426.pac
3815,weapon/we427.pac
3816,weapon/we428.pac
3817,weapon/we429.pac
3818,weapon/we430.pac
3819,weapon/we431.pac
3820,weapon/we432.pac
3821,weapon/we433.pac
3822,weapon/we434.pac
3823,weapon/we435.pac
3824,weapon/we436.pac
3825,weapon/we437.pac
3826,weapon/we438.pac
3827,weapon/we439.pac
3828,weapon/we440.pac
3829,weapon/we441.pac
3830,weapon/we442.pac
3831,weapon/we443.pac
3832,weapon/we444.pac
3833,weapon/we445.pac
3834,weapon/we446.pac
3835,weapon/we447.pac
3836,weapon/we448.pac
3837,weapon/we449.pac
3838,weapon/we450.pac
3839,weapon/we451.pac
3840,weapon/we452.pac
3841,weapon/we453.pac
3842,weapon/we454.pac
3843,weapon/we455.pac
3844,weapon/we456.pac
3845,weapon/we457.pac
3846,weapon/we458.pac
3847,weapon/we459.pac
3848,weapon/we460.pac
3849,weapon/we461.pac
3850,weapon/we462.pac
3851,weapon/we463.pac
3852,weapon/we464.pac
3853,weapon/we465.pac
3854,weapon/we466.pac
3855,weapon/we467.pac
3856,weapon/we468.pac
3857,weapon/we469.pac
3858,weapon/we470.pac
3859,weapon/we471.pac
3860,weapon/we472.pac
3861,weapon/we473.pac
3862,weapon/we474.pac
3863,weapon/we475.pac
3864,weapon/we476.pac
3865,weapon/we477.pac
3866,weapon/we478.pac
3867,weapon/we479.pac
3868,weapon/we480.pac
3869,weapon/we481.pac
3870,weapon/we482.pac
3871,weapon/we483.pac
3872,weapon/we484.pac
3873,weapon/we485.pac
3874,weapon/we486.pac
3875,weapon/we487.pac
3876,weapon/we488.pac
3877,weapon/we489.pac
3878,weapon/we490.pac
3879,weapon/we491.pac
3880,weapon/we492.pac
3881,weapon/we493.pac
3882,weapon/we494.pac
3883,weapon/we495.pac
3884,weapon/we496.pac
3885,weapon/we497.pac
3886,weapon/we498.pac
3887,weapon/we499.pac
3888,weapon/we500.pac
3889,weapon/we501.pac
3890,weapon/we502.pac
3891,weapon/we503.pac
3892,weapon/we504.pac
3893,weapon/we505.pac
3894,weapon/we506.pac
3895,weapon/we507.pac
3896,weapon/we508.pac
3897,weapon/we509.pac
3898,weapon/we510.pac
3899,weapon/we511.pac
3900,weapon/we512.pac
3901,weapon/we513.pac
3902,weapon/we514.pac
3903,weapon/we515.pac
3904,weapon/we516.pac
3905,weapon/we517.pac
3906,weapon/we518.pac
3907,weapon/we519.pac
3908,weapon/we520.pac
3909,weapon/we521.pac
3910,weapon/we522.pac
3911,weapon/we523.pac
3912,weapon/we524.pac
3913,weapon/we525.pac
3914,weapon/we526.pac
3915,weapon/we527.pac
3916,weapon/we528.pac
3917,weapon/we529.pac
3918,weapon/we530.pac
3919,weapon/we531.pac
3920,weapon/we532.pac
3921,weapon/we533.pac
3922,weapon/we534.pac
3923,weapon/we535.pac
3924,weapon/we536.pac
3925,weapon/we537.pac
3926,weapon/we538.pac
3927,weapon/we539.pac
3928,weapon/we540.pac
3929,weapon/we541.pac
3930,weapon/we542.pac
3931,weapon/we543.pac
3932,weapon/we544.pac
3933,weapon/we545.pac
3934,weapon/we546.pac
3935,weapon/we547.pac
3936,weapon/we548.pac
3937,weapon/we549.pac
3938,weapon/we550.pac
3939,weapon/we551.pac
3940,weapon/we552.pac
3941,player/f/skin/f_skin000.tmh
3942,player/f/skin/f_skin001.tmh
3943,player/f/skin/f_skin002.tmh
3944,player/f/skin/f_skin003.tmh
3945,player/m/skin/m_skin000.tmh
3946,player/m/skin/m_skin001.tmh
3947,player/m/skin/m_skin002.tmh
3948,player/m/skin/m_skin003.tmh
3949,sound/se/snd_weapon00.phd
3950,sound/se/snd_weapon00.bd
3951,sound/se/snd_weapon01.phd
3952,sound/se/snd_weapon01.bd
3953,sound/se/snd_weapon02.phd
3954,sound/se/snd_weapon02.bd
3955,sound/se/snd_weapon03.phd
3956,sound/se/snd_weapon03.bd
3957,sound/se/snd_weapon04.phd
3958,sound/se/snd_weapon04.bd
3959,sound/se/snd_weapon05.phd
3960,sound/se/snd_weapon05.bd
3961,sound/se/snd_weapon06.phd
3962,sound/se/snd_weapon06.bd
3963,sound/se/snd_weapon07.phd
3964,sound/se/snd_weapon07.bd
3965,sound/se/snd_weapon08.phd
3966,sound/se/snd_weapon08.bd
3967,sound/se/snd_weapon09.phd
3968,sound/se/snd_weapon09.bd
3969,sound/se/snd_weapon10.phd
3970,sound/se/snd_weapon10.bd
3971,sound/se/snd_weapon11.phd
3972,sound/se/snd_weapon11.bd
3973,sound/se/snd_weapon13.phd
3974,sound/se/snd_weapon13.bd
3975,sound/se/snd_weapon15.phd
3976,sound/se/snd_weapon15.bd
3977,sound/se/snd_weapon17.phd
3978,sound/se/snd_weapon17.bd
3979,sound/se/snd_weapon18.phd
3980,sound/se/snd_weapon18.bd
3981,sound/se/snd_weapon19.phd
3982,sound/se/snd_weapon19.bd
3983,sound/se/snd_weapon20.phd
3984,sound/se/snd_weapon20.bd
3985,sound/se/snd_weapon22.phd
3986,sound/se/snd_weapon22.bd
3987,sound/se/snd_weapon23.phd
3988,sound/se/snd_weapon23.bd
3989,sound/se/snd_weapon24.phd
3990,sound/se/snd_weapon24.bd
3991,sound/se/snd_weapon25.phd
3992,sound/se/snd_weapon25.bd
3993,sound/se/snd_weapon26.phd
3994,sound/se/snd_weapon26.bd
3995,sound/se/snd_weapon27.phd
3996,sound/se/snd_weapon27.bd
3997,sound/se/snd_weapon28.phd
3998,sound/se/snd_weapon28.bd
3999,sound/se/snd_weapon29.phd
4000,sound/se/snd_weapon29.bd
4001,sound/se/snd_weapon30.phd
4002,sound/se/snd_weapon30.bd
4003,sound/se/snd_weapon31.phd
4004,sound/se/snd_weapon31.bd
4005,sound/se/snd_weapon33.phd
4006,sound/se/snd_weapon33.bd
4007,sound/se/snd_weapon34.phd
4008,sound/se/snd_weapon34.bd
4009,sound/se/snd_weapon35.phd
4010,sound/se/snd_weapon35.bd
4011,sound/se/snd_weapon36.phd
4012,sound/se/snd_weapon36.bd
4013,sound/se/snd_weapon37.phd
4014,sound/se/snd_weapon37.bd
4015,sound/se/snd_weapon38.phd
4016,sound/se/snd_weapon38.bd
4017,sound/se/snd_weapon39.phd
4018,sound/se/snd_weapon39.bd
4019,sound/se/snd_weapon40.phd
4020,sound/se/snd_weapon40.bd
4021,sound/se/snd_weapon41.phd
4022,sound/se/snd_weapon41.bd
4023,sound/se/snd_weapon42.phd
4024,sound/se/snd_weapon42.bd
4025,sound/se/snd_weapon43.phd
4026,sound/se/snd_weapon43.bd
4027,sound/se/snd_weapon44.phd
4028,sound/se/snd_weapon44.bd
4029,sound/se/snd_weapon45.phd
4030,sound/se/snd_weapon45.bd
4031,sound/se/snd_weapon47.phd
4032,sound/se/snd_weapon47.bd
4033,sound/se/snd_weapon48.phd
4034,sound/se/snd_weapon48.bd
4035,sound/se/snd_weapon49.phd
4036,sound/se/snd_weapon49.bd
4037,sound/se/snd_weapon51.phd
4038,sound/se/snd_weapon51.bd
4039,sound/se/snd_weapon52.phd
4040,sound/se/snd_weapon52.bd
4041,sound/se/snd_weapon53.phd
4042,sound/se/snd_weapon53.bd
4043,sound/se/snd_weapon54.phd
4044,sound/se/snd_weapon54.bd
4045,sound/se/snd_weapon56.phd
4046,sound/se/snd_weapon56.bd
4047,sound/se/snd_weapon58.phd
4048,sound/se/snd_weapon58.bd
4049,sound/se/snd_weapon59.phd
4050,sound/se/snd_weapon59.bd
4051,sound/se/snd_weapon61.phd
4052,sound/se/snd_weapon61.bd
4053,sound/se/snd_weapon62.phd
4054,sound/se/snd_weapon62.bd
4055,sound/se/snd_weapon65.phd
4056,sound/se/snd_weapon65.bd
4057,sound/se/snd_weapon66.phd
4058,sound/se/snd_weapon66.bd
4059,sound/se/snd_weapon67.phd
4060,sound/se/snd_weapon67.bd
4061,sound/se/snd_weapon68.phd
4062,sound/se/snd_weapon68.bd
4063,sound/se/snd_weapon69.phd
4064,sound/se/snd_weapon69.bd
4065,sound/se/snd_weapon70.phd
4066,sound/se/snd_weapon70.bd
4067,sound/se/snd_weapon71.phd
4068,sound/se/snd_weapon71.bd
4069,sound/se/snd_weapon72.phd
4070,sound/se/snd_weapon72.bd
4071,sound/se/snd_weapon73.phd
4072,sound/se/snd_weapon73.bd
4073,sound/se/snd_weapon74.phd
4074,sound/se/snd_weapon74.bd
4075,sound/se/snd_weapon75.phd
4076,sound/se/snd_weapon75.bd
4077,sound/se/snd_weapon76.phd
4078,sound/se/snd_weapon76.bd
4079,sound/se/snd_weapon77.phd
4080,sound/se/snd_weapon77.bd
4081,sound/se/snd_weapon78.phd
4082,sound/se/snd_weapon78.bd
4083,sound/se/snd_weapon79.phd
4084,sound/se/snd_weapon79.bd
4085,sound/se/snd_weapon80.phd
4086,sound/se/snd_weapon80.bd
4087,sound/se/snd_weapon81.phd
4088,sound/se/snd_weapon81.bd
4089,sound/se/snd_weapon82.phd
4090,sound/se/snd_weapon82.bd
4091,sound/se/snd_weapon83.phd
4092,sound/se/snd_weapon83.bd
4093,sound/se/snd_weapon84.phd
4094,sound/se/snd_weapon84.bd
4095,sound/se/snd_weapon85.phd
4096,sound/se/snd_weapon85.bd
4097,sound/se/snd_weapon86.phd
4098,sound/se/snd_weapon86.bd
4099,sound/se/snd_weapon87.phd
4100,sound/se/snd_weapon87.bd
4101,sound/se/snd_weapon88.phd
4102,sound/se/snd_weapon88.bd
4103,sound/se/snd_weapon89.phd
4104,sound/se/snd_weapon89.bd
4105,sound/se/snd_weapon92.phd
4106,sound/se/snd_weapon92.bd
4107,sound/se/snd_weapon94.phd
4108,sound/se/snd_weapon94.bd
4109,sound/se/snd_weapon97.phd
4110,sound/se/snd_weapon97.bd
4111,sound/se/snd_weapon99.phd
4112,sound/se/snd_weapon99.bd
4113,sound/se/snd_weapon103.phd
4114,sound/se/snd_weapon103.bd
4115,sound/se/snd_weapon105.phd
4116,sound/se/snd_weapon105.bd
4117,sound/se/snd_weapon107.phd
4118,sound/se/snd_weapon107.bd
4119,sound/se/snd_weapon109.phd
4120,sound/se/snd_weapon109.bd
4121,sound/se/snd_weapon111.phd
4122,sound/se/snd_weapon111.bd
4123,sound/se/snd_weapon112.phd
4124,sound/se/snd_weapon112.bd
4125,sound/se/snd_weapon113.phd
4126,sound/se/snd_weapon113.bd
4127,sound/se/snd_weapon114.phd
4128,sound/se/snd_weapon114.bd
4129,sound/se/snd_weapon115.phd
4130,sound/se/snd_weapon115.bd
4131,sound/se/snd_weapon116.phd
4132,sound/se/snd_weapon116.bd
4133,sound/se/snd_weapon117.phd
4134,sound/se/snd_weapon117.bd
4135,sound/se/snd_weapon119.phd
4136,sound/se/snd_weapon119.bd
4137,sound/se/snd_weapon120.phd
4138,sound/se/snd_weapon120.bd
4139,sound/se/snd_weapon121.phd
4140,sound/se/snd_weapon121.bd
4141,sound/se/snd_weapon122.phd
4142,sound/se/snd_weapon122.bd
4143,sound/se/snd_weapon123.phd
4144,sound/se/snd_weapon123.bd
4145,sound/se/snd_weapon124.phd
4146,sound/se/snd_weapon124.bd
4147,sound/se/snd_weapon125.phd
4148,sound/se/snd_weapon125.bd
4149,sound/se/snd_weapon126.phd
4150,sound/se/snd_weapon126.bd
4151,sound/se/snd_weapon127.phd
4152,sound/se/snd_weapon127.bd
4153,sound/se/snd_weapon128.phd
4154,sound/se/snd_weapon128.bd
4155,sound/se/snd_weapon129.phd
4156,sound/se/snd_weapon129.bd
4157,sound/se/snd_weapon130.phd
4158,sound/se/snd_weapon130.bd
4159,sound/se/snd_weapon131.phd
4160,sound/se/snd_weapon131.bd
4161,sound/se/snd_weapon132.phd
4162,sound/se/snd_weapon132.bd
4163,sound/se/snd_weapon133.phd
4164,sound/se/snd_weapon133.bd
4165,sound/se/snd_weapon134.phd
4166,sound/se/snd_weapon134.bd
4167,sound/se/snd_weapon140.phd
4168,sound/se/snd_weapon140.bd
4169,sound/se/snd_weapon141.phd
4170,sound/se/snd_weapon141.bd
4171,sound/se/snd_weapon142.phd
4172,sound/se/snd_weapon142.bd
4173,sound/se/snd_weapon146.phd
4174,sound/se/snd_weapon146.bd
4175,sound/se/snd_weapon148.phd
4176,sound/se/snd_weapon148.bd
4177,sound/se/snd_weapon149.phd
4178,sound/se/snd_weapon149.bd
4179,sound/se/snd_weapon150.phd
4180,sound/se/snd_weapon150.bd
4181,sound/se/snd_weapon151.phd
4182,sound/se/snd_weapon151.bd
4183,sound/se/snd_weapon152.phd
4184,sound/se/snd_weapon152.bd
4185,sound/se/snd_weapon161.phd
4186,sound/se/snd_weapon161.bd
4187,sound/se/snd_weapon172.phd
4188,sound/se/snd_weapon172.bd
4189,sound/se/snd_weapon174.phd
4190,sound/se/snd_weapon174.bd
4191,sound/se/snd_weapon179.phd
4192,sound/se/snd_weapon179.bd
4193,sound/se/snd_weapon180.phd
4194,sound/se/snd_weapon180.bd
4195,sound/se/snd_weapon188.phd
4196,sound/se/snd_weapon188.bd
4197,sound/se/snd_weapon193.phd
4198,sound/se/snd_weapon193.bd
4199,sound/se/snd_weapon195.phd
4200,sound/se/snd_weapon195.bd
4201,sound/se/snd_weapon197.phd
4202,sound/se/snd_weapon197.bd
4203,sound/se/snd_weapon203.phd
4204,sound/se/snd_weapon203.bd
4205,sound/se/snd_weapon211.phd
4206,sound/se/snd_weapon211.bd
4207,sound/se/snd_weapon214.phd
4208,sound/se/snd_weapon214.bd
4209,sound/se/snd_weapon218.phd
4210,sound/se/snd_weapon218.bd
4211,sound/se/snd_weapon219.phd
4212,sound/se/snd_weapon219.bd
4213,sound/se/snd_weapon220.phd
4214,sound/se/snd_weapon220.bd
4215,sound/se/snd_weapon221.phd
4216,sound/se/snd_weapon221.bd
4217,sound/se/snd_weapon222.phd
4218,sound/se/snd_weapon222.bd
4219,sound/se/snd_weapon223.phd
4220,sound/se/snd_weapon223.bd
4221,sound/se/snd_weapon224.phd
4222,sound/se/snd_weapon224.bd
4223,sound/se/snd_weapon225.phd
4224,sound/se/snd_weapon225.bd
4225,sound/se/snd_weapon226.phd
4226,sound/se/snd_weapon226.bd
4227,sound/se/snd_weapon227.phd
4228,sound/se/snd_weapon227.bd
4229,sound/se/snd_weapon228.phd
4230,sound/se/snd_weapon228.bd
4231,sound/se/snd_weapon229.phd
4232,sound/se/snd_weapon229.bd
4233,sound/se/snd_weapon231.phd
4234,sound/se/snd_weapon231.bd
4235,sound/se/snd_weapon232.phd
4236,sound/se/snd_weapon232.bd
4237,sound/se/snd_weapon233.phd
4238,sound/se/snd_weapon233.bd
4239,sound/se/snd_weapon234.phd
4240,sound/se/snd_weapon234.bd
4241,sound/se/snd_weapon235.phd
4242,sound/se/snd_weapon235.bd
4243,sound/se/snd_weapon236.phd
4244,sound/se/snd_weapon236.bd
4245,sound/se/snd_weapon237.phd
4246,sound/se/snd_weapon237.bd
4247,sound/se/snd_weapon238.phd
4248,sound/se/snd_weapon238.bd
4249,sound/se/snd_weapon240.phd
4250,sound/se/snd_weapon240.bd
4251,sound/se/snd_weapon242.phd
4252,sound/se/snd_weapon242.bd
4253,sound/se/snd_weapon244.phd
4254,sound/se/snd_weapon244.bd
4255,sound/se/snd_weapon245.phd
4256,sound/se/snd_weapon245.bd
4257,sound/se/snd_weapon246.phd
4258,sound/se/snd_weapon246.bd
4259,sound/se/snd_weapon247.phd
4260,sound/se/snd_weapon247.bd
4261,sound/se/snd_weapon249.phd
4262,sound/se/snd_weapon249.bd
4263,sound/se/snd_weapon250.phd
4264,sound/se/snd_weapon250.bd
4265,sound/se/snd_weapon252.phd
4266,sound/se/snd_weapon252.bd
4267,sound/se/snd_weapon253.phd
4268,sound/se/snd_weapon253.bd
4269,sound/se/snd_weapon254.phd
4270,sound/se/snd_weapon254.bd
4271,sound/se/snd_weapon255.phd
4272,sound/se/snd_weapon255.bd
4273,sound/se/snd_weapon256.phd
4274,sound/se/snd_weapon256.bd
4275,sound/se/snd_weapon257.phd
4276,sound/se/snd_weapon257.bd
4277,sound/se/snd_weapon258.phd
4278,sound/se/snd_weapon258.bd
4279,sound/se/snd_weapon259.phd
4280,sound/se/snd_weapon259.bd
4281,sound/se/snd_weapon260.phd
4282,sound/se/snd_weapon260.bd
4283,sound/se/snd_weapon261.phd
4284,sound/se/snd_weapon261.bd
4285,sound/se/snd_weapon262.phd
4286,sound/se/snd_weapon262.bd
4287,sound/se/snd_weapon263.phd
4288,sound/se/snd_weapon263.bd
4289,sound/se/snd_weapon264.phd
4290,sound/se/snd_weapon264.bd
4291,sound/se/snd_weapon265.phd
4292,sound/se/snd_weapon265.bd
4293,sound/se/snd_weapon266.phd
4294,sound/se/snd_weapon266.bd
4295,sound/se/snd_weapon267.phd
4296,sound/se/snd_weapon267.bd
4297,sound/se/snd_weapon268.phd
4298,sound/se/snd_weapon268.bd
4299,sound/se/snd_weapon269.phd
4300,sound/se/snd_weapon269.bd
4301,sound/se/snd_weapon270.phd
4302,sound/se/snd_weapon270.bd
4303,sound/se/snd_weapon271.phd
4304,sound/se/snd_weapon271.bd
4305,sound/se/snd_weapon272.phd
4306,sound/se/snd_weapon272.bd
4307,sound/se/snd_weapon273.phd
4308,sound/se/snd_weapon273.bd
4309,sound/se/snd_weapon274.phd
4310,sound/se/snd_weapon274.bd
4311,sound/se/snd_weapon275.phd
4312,sound/se/snd_weapon275.bd
4313,sound/se/snd_weapon276.phd
4314,sound/se/snd_weapon276.bd
4315,sound/se/snd_weapon277.phd
4316,sound/se/snd_weapon277.bd
4317,sound/se/snd_weapon278.phd
4318,sound/se/snd_weapon278.bd
4319,sound/se/snd_weapon279.phd
4320,sound/se/snd_weapon279.bd
4321,sound/se/snd_weapon280.phd
4322,sound/se/snd_weapon280.bd
4323,sound/se/snd_weapon281.phd
4324,sound/se/snd_weapon281.bd
4325,sound/se/snd_weapon282.phd
4326,sound/se/snd_weapon282.bd
4327,sound/se/snd_weapon283.phd
4328,sound/se/snd_weapon283.bd
4329,sound/se/snd_weapon285.phd
4330,sound/se/snd_weapon285.bd
4331,sound/se/snd_weapon286.phd
4332,sound/se/snd_weapon286.bd
4333,sound/se/snd_weapon287.phd
4334,sound/se/snd_weapon287.bd
4335,sound/se/snd_weapon288.phd
4336,sound/se/snd_weapon288.bd
4337,sound/se/snd_weapon289.phd
4338,sound/se/snd_weapon289.bd
4339,sound/se/snd_weapon290.phd
4340,sound/se/snd_weapon290.bd
4341,sound/se/snd_weapon291.phd
4342,sound/se/snd_weapon291.bd
4343,sound/se/snd_weapon292.phd
4344,sound/se/snd_weapon292.bd
4345,sound/se/snd_weapon293.phd
4346,sound/se/snd_weapon293.bd
4347,sound/se/snd_weapon294.phd
4348,sound/se/snd_weapon294.bd
4349,sound/se/snd_weapon295.phd
4350,sound/se/snd_weapon295.bd
4351,sound/se/snd_weapon296.phd
4352,sound/se/snd_weapon296.bd
4353,sound/se/snd_weapon297.phd
4354,sound/se/snd_weapon297.bd
4355,sound/se/snd_weapon298.phd
4356,sound/se/snd_weapon298.bd
4357,sound/se/snd_weapon299.phd
4358,sound/se/snd_weapon299.bd
4359,sound/se/snd_weapon300.phd
4360,sound/se/snd_weapon300.bd
4361,sound/se/snd_weapon301.phd
4362,sound/se/snd_weapon301.bd
4363,sound/se/snd_weapon302.phd
4364,sound/se/snd_weapon302.bd
4365,sound/se/snd_weapon303.phd
4366,sound/se/snd_weapon303.bd
4367,sound/se/snd_weapon304.phd
4368,sound/se/snd_weapon304.bd
4369,sound/se/snd_weapon305.phd
4370,sound/se/snd_weapon305.bd
4371,sound/se/snd_weapon306.phd
4372,sound/se/snd_weapon306.bd
4373,sound/se/snd_weapon309.phd
4374,sound/se/snd_weapon309.bd
4375,sound/se/snd_weapon310.phd
4376,sound/se/snd_weapon310.bd
4377,sound/se/snd_weapon311.phd
4378,sound/se/snd_weapon311.bd
4379,sound/se/snd_weapon312.phd
4380,sound/se/snd_weapon312.bd
4381,sound/se/snd_weapon313.phd
4382,sound/se/snd_weapon313.bd
4383,sound/se/snd_weapon314.phd
4384,sound/se/snd_weapon314.bd
4385,sound/se/snd_weapon316.phd
4386,sound/se/snd_weapon316.bd
4387,sound/se/snd_weapon317.phd
4388,sound/se/snd_weapon317.bd
4389,sound/se/snd_weapon318.phd
4390,sound/se/snd_weapon318.bd
4391,sound/se/snd_weapon321.phd
4392,sound/se/snd_weapon321.bd
4393,sound/se/snd_weapon322.phd
4394,sound/se/snd_weapon322.bd
4395,sound/se/snd_weapon323.phd
4396,sound/se/snd_weapon323.bd
4397,sound/se/snd_weapon324.phd
4398,sound/se/snd_weapon324.bd
4399,sound/se/snd_weapon325.phd
4400,sound/se/snd_weapon325.bd
4401,sound/se/snd_weapon326.phd
4402,sound/se/snd_weapon326.bd
4403,sound/se/snd_weapon328.phd
4404,sound/se/snd_weapon328.bd
4405,sound/se/snd_weapon329.phd
4406,sound/se/snd_weapon329.bd
4407,sound/se/snd_weapon330.phd
4408,sound/se/snd_weapon330.bd
4409,sound/se/snd_weapon331.phd
4410,sound/se/snd_weapon331.bd
4411,sound/se/snd_weapon332.phd
4412,sound/se/snd_weapon332.bd
4413,sound/se/snd_weapon333.phd
4414,sound/se/snd_weapon333.bd
4415,sound/se/snd_weapon334.phd
4416,sound/se/snd_weapon334.bd
4417,sound/se/snd_weapon335.phd
4418,sound/se/snd_weapon335.bd
4419,sound/se/snd_weapon337.bd
4420,sound/se/snd_weapon337.phd
4421,sound/se/snd_weapon340.bd
4422,sound/se/snd_weapon340.phd
4423,sound/se/snd_weapon342.bd
4424,sound/se/snd_weapon342.phd
4425,sound/se/snd_weapon345.bd
4426,sound/se/snd_weapon345.phd
4427,sound/se/snd_weapon347.bd
4428,sound/se/snd_weapon347.phd
4429,sound/se/snd_weapon348.bd
4430,sound/se/snd_weapon348.phd
4431,sound/se/snd_weapon349.bd
4432,sound/se/snd_weapon349.phd
4433,sound/se/snd_weapon350.bd
4434,sound/se/snd_weapon350.phd
4435,sound/se/snd_weapon351.bd
4436,sound/se/snd_weapon351.phd
4437,sound/se/snd_weapon352.bd
4438,sound/se/snd_weapon352.phd
4439,sound/se/snd_weapon353.bd
4440,sound/se/snd_weapon353.phd
4441,sound/se/snd_weapon354.bd
4442,sound/se/snd_weapon354.phd
4443,sound/se/snd_weapon357.bd
4444,sound/se/snd_weapon357.phd
4445,sound/se/snd_weapon358.bd
4446,sound/se/snd_weapon358.phd
4447,sound/se/snd_weapon359.bd
4448,sound/se/snd_weapon359.phd
4449,sound/se/snd_weapon360.bd
4450,sound/se/snd_weapon360.phd
4451,sound/se/snd_weapon361.bd
4452,sound/se/snd_weapon361.phd
4453,sound/se/snd_weapon362.bd
4454,sound/se/snd_weapon362.phd
4455,sound/se/snd_weapon363.bd
4456,sound/se/snd_weapon363.phd
4457,sound/se/snd_weapon365.bd
4458,sound/se/snd_weapon365.phd
4459,sound/se/snd_weapon366.bd
4460,sound/se/snd_weapon366.phd
4461,sound/se/snd_weapon367.bd
4462,sound/se/snd_weapon367.phd
4463,sound/se/snd_weapon368.bd
4464,sound/se/snd_weapon368.phd
4465,sound/se/snd_weapon369.bd
4466,sound/se/snd_weapon369.phd
4467,sound/se/snd_weapon370.bd
4468,sound/se/snd_weapon370.phd
4469,sound/se/snd_weapon371.bd
4470,sound/se/snd_weapon371.phd
4471,sound/se/snd_weapon372.bd
4472,sound/se/snd_weapon372.phd
4473,sound/se/snd_weapon373.bd
4474,sound/se/snd_weapon373.phd
4475,sound/se/snd_weapon374.bd
4476,sound/se/snd_weapon374.phd
4477,sound/se/snd_weapon375.bd
4478,sound/se/snd_weapon375.phd
4479,sound/se/snd_weapon377.bd
4480,sound/se/snd_weapon377.phd
4481,sound/se/snd_weapon378.bd
4482,sound/se/snd_weapon378.phd
4483,sound/se/snd_weapon379.bd
4484,sound/se/snd_weapon379.phd
4485,sound/se/snd_weapon380.bd
4486,sound/se/snd_weapon380.phd
4487,sound/se/snd_weapon381.bd
4488,sound/se/snd_weapon381.phd
4489,sound/se/snd_weapon382.bd
4490,sound/se/snd_weapon382.phd
4491,sound/se/snd_weapon383.bd
4492,sound/se/snd_weapon383.phd
4493,sound/se/snd_weapon384.bd
4494,sound/se/snd_weapon384.phd
4495,sound/se/snd_weapon385.bd
4496,sound/se/snd_weapon385.phd
4497,sound/se/snd_weapon386.bd
4498,sound/se/snd_weapon386.phd
4499,sound/se/snd_weapon388.bd
4500,sound/se/snd_weapon388.phd
4501,sound/se/snd_weapon394.bd
4502,sound/se/snd_weapon394.phd
4503,sound/se/snd_weapon395.bd
4504,sound/se/snd_weapon395.phd
4505,sound/se/snd_weapon396.bd
4506,sound/se/snd_weapon396.phd
4507,sound/se/snd_weapon397.bd
4508,sound/se/snd_weapon397.phd
4509,sound/se/snd_weapon398.bd
4510,sound/se/snd_weapon398.phd
4511,sound/se/snd_weapon399.bd
4512,sound/se/snd_weapon399.phd
4513,sound/se/snd_weapon400.bd
4514,sound/se/snd_weapon400.phd
4515,sound/se/snd_weapon401.bd
4516,sound/se/snd_weapon401.phd
4517,sound/se/snd_weapon402.bd
4518,sound/se/snd_weapon402.phd
4519,sound/se/snd_weapon403.bd
4520,sound/se/snd_weapon403.phd
4521,sound/se/snd_weapon405.bd
4522,sound/se/snd_weapon405.phd
4523,sound/se/snd_weapon407.bd
4524,sound/se/snd_weapon407.phd
4525,sound/se/snd_weapon408.bd
4526,sound/se/snd_weapon408.phd
4527,sound/se/snd_weapon409.bd
4528,sound/se/snd_weapon409.phd
4529,sound/se/snd_weapon410.bd
4530,sound/se/snd_weapon410.phd
4531,sound/se/snd_weapon411.bd
4532,sound/se/snd_weapon411.phd
4533,sound/se/snd_weapon413.bd
4534,sound/se/snd_weapon413.phd
4535,sound/se/snd_weapon414.bd
4536,sound/se/snd_weapon414.phd
4537,sound/se/snd_weapon415.bd
4538,sound/se/snd_weapon415.phd
4539,sound/se/snd_weapon417.bd
4540,sound/se/snd_weapon417.phd
4541,sound/se/snd_weapon419.bd
4542,sound/se/snd_weapon419.phd
4543,sound/se/snd_weapon420.bd
4544,sound/se/snd_weapon420.phd
4545,sound/se/snd_weapon421.bd
4546,sound/se/snd_weapon421.phd
4547,sound/se/snd_weapon422.bd
4548,sound/se/snd_weapon422.phd
4549,sound/se/snd_weapon423.bd
4550,sound/se/snd_weapon423.phd
4551,sound/se/snd_weapon424.bd
4552,sound/se/snd_weapon424.phd
4553,sound/se/snd_weapon425.bd
4554,sound/se/snd_weapon425.phd
4555,sound/se/snd_weapon426.bd
4556,sound/se/snd_weapon426.phd
4557,sound/se/snd_weapon427.bd
4558,sound/se/snd_weapon427.phd
4559,sound/se/snd_weapon428.bd
4560,sound/se/snd_weapon428.phd
4561,sound/se/snd_weapon429.bd
4562,sound/se/snd_weapon429.phd
4563,sound/se/snd_weapon430.bd
4564,sound/se/snd_weapon430.phd
4565,sound/se/snd_weapon431.bd
4566,sound/se/snd_weapon431.phd
4567,sound/se/snd_weapon432.bd
4568,sound/se/snd_weapon432.phd
4569,sound/se/snd_weapon433.bd
4570,sound/se/snd_weapon433.phd
4571,sound/se/snd_weapon434.bd
4572,sound/se/snd_weapon434.phd
4573,sound/se/snd_weapon435.bd
4574,sound/se/snd_weapon435.phd
4575,sound/se/snd_weapon436.bd
4576,sound/se/snd_weapon436.phd
4577,sound/se/snd_weapon437.bd
4578,sound/se/snd_weapon437.phd
4579,sound/se/snd_weapon438.bd
4580,sound/se/snd_weapon438.phd
4581,sound/se/snd_weapon439.bd
4582,sound/se/snd_weapon439.phd
4583,sound/se/snd_weapon440.bd
4584,sound/se/snd_weapon440.phd
4585,sound/se/snd_weapon441.bd
4586,sound/se/snd_weapon441.phd
4587,sound/se/snd_weapon442.bd
4588,sound/se/snd_weapon442.phd
4589,sound/se/snd_weapon443.bd
4590,sound/se/snd_weapon443.phd
4591,sound/se/snd_weapon444.bd
4592,sound/se/snd_weapon444.phd
4593,sound/se/snd_weapon445.bd
4594,sound/se/snd_weapon445.phd
4595,sound/se/snd_weapon446.bd
4596,sound/se/snd_weapon446.phd
4597,sound/se/snd_weapon447.bd
4598,sound/se/snd_weapon447.phd
4599,sound/se/snd_weapon448.bd
4600,sound/se/snd_weapon448.phd
4601,sound/se/snd_weapon449.bd
4602,sound/se/snd_weapon449.phd
4603,sound/se/snd_weapon450.bd
4604,sound/se/snd_weapon450.phd
4605,sound/se/snd_weapon451.bd
4606,sound/se/snd_weapon451.phd
4607,sound/se/snd_weapon452.bd
4608,sound/se/snd_weapon452.phd
4609,sound/se/snd_weapon453.bd
4610,sound/se/snd_weapon453.phd
4611,sound/se/snd_weapon454.bd
4612,sound/se/snd_weapon454.phd
4613,sound/se/snd_weapon455.bd
4614,sound/se/snd_weapon455.phd
4615,sound/se/snd_weapon456.bd
4616,sound/se/snd_weapon456.phd
4617,sound/se/snd_weapon457.bd
4618,sound/se/snd_weapon457.phd
4619,sound/se/snd_weapon458.bd
4620,sound/se/snd_weapon458.phd
4621,sound/se/snd_weapon459.bd
4622,sound/se/snd_weapon459.phd
4623,sound/se/snd_weapon460.bd
4624,sound/se/snd_weapon460.phd
4625,sound/se/snd_weapon461.bd
4626,sound/se/snd_weapon461.phd
4627,sound/se/snd_weapon462.bd
4628,sound/se/snd_weapon462.phd
4629,sound/se/snd_weapon463.bd
4630,sound/se/snd_weapon463.phd
4631,sound/se/snd_weapon464.bd
4632,sound/se/snd_weapon464.phd
4633,sound/se/snd_weapon465.bd
4634,sound/se/snd_weapon465.phd
4635,sound/se/snd_weapon466.bd
4636,sound/se/snd_weapon466.phd
4637,sound/se/snd_weapon467.bd
4638,sound/se/snd_weapon467.phd
4639,sound/se/snd_weapon490.bd
4640,sound/se/snd_weapon490.phd
4641,sound/se/snd_weapon498.bd
4642,sound/se/snd_weapon498.phd
4643,sound/se/snd_weapon499.bd
4644,sound/se/snd_weapon499.phd
4645,sound/se/snd_weapon534.bd
4646,sound/se/snd_weapon534.phd
4647,sound/se/snd_weapon535.bd
4648,sound/se/snd_weapon535.phd
4649,sound/se/snd_weapon536.bd
4650,sound/se/snd_weapon536.phd
4651,sound/se/snd_weapon537.bd
4652,sound/se/snd_weapon537.phd
4653,sound/se/snd_weapon538.bd
4654,sound/se/snd_weapon538.phd
4655,sound/se/snd_weapon539.bd
4656,sound/se/snd_weapon539.phd
4657,sound/se/snd_weapon541.bd
4658,sound/se/snd_weapon541.phd
4659,sound/se/snd_weapon542.bd
4660,sound/se/snd_weapon542.phd
4661,sound/se/snd_weapon543.bd
4662,sound/se/snd_weapon543.phd
4663,sound/se/snd_weapon544.bd
4664,sound/se/snd_weapon544.phd
4665,sound/se/snd_weapon548.bd
4666,sound/se/snd_weapon548.phd
4667,sound/se/snd_weapon549.bd
4668,sound/se/snd_weapon549.phd
4669,sound/se/snd_weapon550.bd
4670,sound/se/snd_weapon550.phd
4671,sound/se/snd_weapon551.bd
4672,sound/se/snd_weapon551.phd
4673,sound/se/snd_weapon800.phd
4674,sound/se/snd_weapon800.bd
4675,sound/se/snd_weapon.tsb
4676,sound/se/snd_vo_f00.phd
4677,sound/se/snd_vo_f00.bd
4678,sound/se/snd_vo_f01.phd
4679,sound/se/snd_vo_f01.bd
4680,sound/se/snd_vo_f02.phd
4681,sound/se/snd_vo_f02.bd
4682,sound/se/snd_vo_f03.phd
4683,sound/se/snd_vo_f03.bd
4684,sound/se/snd_vo_f04.phd
4685,sound/se/snd_vo_f04.bd
4686,sound/se/snd_vo_f05.phd
4687,sound/se/snd_vo_f05.bd
4688,sound/se/snd_vo_f06.phd
4689,sound/se/snd_vo_f06.bd
4690,sound/se/snd_vo_f07.phd
4691,sound/se/snd_vo_f07.bd
4692,sound/se/snd_vo_f08.phd
4693,sound/se/snd_vo_f08.bd
4694,sound/se/snd_vo_f09.phd
4695,sound/se/snd_vo_f09.bd
4696,sound/se/snd_vo_f10.phd
4697,sound/se/snd_vo_f10.bd
4698,sound/se/snd_vo_f11.phd
4699,sound/se/snd_vo_f11.bd
4700,sound/se/snd_vo_f12.phd
4701,sound/se/snd_vo_f12.bd
4702,sound/se/snd_vo_f13.phd
4703,sound/se/snd_vo_f13.bd
4704,sound/se/snd_vo_f14.phd
4705,sound/se/snd_vo_f14.bd
4706,sound/se/snd_vo_f15.bd
4707,sound/se/snd_vo_f15.phd
4708,sound/se/snd_vo_f16.bd
4709,sound/se/snd_vo_f16.phd
4710,sound/se/snd_vo_m00.phd
4711,sound/se/snd_vo_m00.bd
4712,sound/se/snd_vo_m01.phd
4713,sound/se/snd_vo_m01.bd
4714,sound/se/snd_vo_m02.phd
4715,sound/se/snd_vo_m02.bd
4716,sound/se/snd_vo_m03.phd
4717,sound/se/snd_vo_m03.bd
4718,sound/se/snd_vo_m04.phd
4719,sound/se/snd_vo_m04.bd
4720,sound/se/snd_vo_m05.phd
4721,sound/se/snd_vo_m05.bd
4722,sound/se/snd_vo_m06.phd
4723,sound/se/snd_vo_m06.bd
4724,sound/se/snd_vo_m07.phd
4725,sound/se/snd_vo_m07.bd
4726,sound/se/snd_vo_m08.phd
4727,sound/se/snd_vo_m08.bd
4728,sound/se/snd_vo_m09.phd
4729,sound/se/snd_vo_m09.bd
4730,sound/se/snd_vo_m10.phd
4731,sound/se/snd_vo_m10.bd
4732,sound/se/snd_vo_m11.phd
4733,sound/se/snd_vo_m11.bd
4734,sound/se/snd_vo_m12.phd
4735,sound/se/snd_vo_m12.bd
4736,sound/se/snd_vo_m13.phd
4737,sound/se/snd_vo_m13.bd
4738,sound/se/snd_vo_m14.phd
4739,sound/se/snd_vo_m14.bd
4740,sound/se/snd_vo_m15.bd
4741,sound/se/snd_vo_m15.phd
4742,sound/se/snd_vo_m16.bd
4743,sound/se/snd_vo_m16.phd
4744,sound/se/snd_vo_n00.phd
4745,sound/se/snd_vo_n00.bd
4746,sound/se/snd_vo_n01.phd
4747,sound/se/snd_vo_n01.bd
4748,sound/se/snd_vo_a00.bd
4749,sound/se/snd_vo_a00.phd
4750,sound/se/snd_vo_a01.bd
4751,sound/se/snd_vo_a01.phd
4752,sound/se/snd_vo_a02.bd
4753,sound/se/snd_vo_a02.phd
4754,sound/se/snd_vo_a03.bd
4755,sound/se/snd_vo_a03.phd
4756,message_jpn/quest_str.pac
4757,message_jpn/lobby_str.pac
4758,message_jpn/arcade_str.pac
4759,mission_jpn/m00001.mib
4760,mission_jpn/m00002.mib
4761,mission_jpn/m00003.mib
4762,mission_jpn/m00004.mib
4763,mission_jpn/m00005.mib
4764,mission_jpn/m00006.mib
4765,mission_jpn/m00007.mib
4766,mission_jpn/m00008.mib
4767,mission_jpn/m00009.mib
4768,mission_jpn/m00010.mib
4769,mission_jpn/m00101.mib
4770,mission_jpn/m00102.mib
4771,mission_jpn/m00103.mib
4772,mission_jpn/m00104.mib
4773,mission_jpn/m00105.mib
4774,mission_jpn/m00106.mib
4775,mission_jpn/m00107.mib
4776,mission_jpn/m00108.mib
4777,mission_jpn/m00109.mib
4778,mission_jpn/m01001.mib
4779,mission_jpn/m01002.mib
4780,mission_jpn/m01003.mib
4781,mission_jpn/m01004.mib
4782,mission_jpn/m01005.mib
4783,mission_jpn/m01006.mib
4784,mission_jpn/m01007.mib
4785,mission_jpn/m01008.mib
4786,mission_jpn/m01009.mib
4787,mission_jpn/m01010.mib
4788,mission_jpn/m01011.mib
4789,mission_jpn/m01012.mib
4790,mission_jpn/m01013.mib
4791,mission_jpn/m01014.mib
4792,mission_jpn/m01015.mib
4793,mission_jpn/m01016.mib
4794,mission_jpn/m01017.mib
4795,mission_jpn/m01018.mib
4796,mission_jpn/m01019.mib
4797,mission_jpn/m01020.mib
4798,mission_jpn/m01021.mib
4799,mission_jpn/m01022.mib
4800,mission_jpn/m01101.mib
4801,mission_jpn/m01102.mib
4802,mission_jpn/m01103.mib
4803,mission_jpn/m01104.mib
4804,mission_jpn/m01105.mib
4805,mission_jpn/m01106.mib
4806,mission_jpn/m01107.mib
4807,mission_jpn/m01108.mib
4808,mission_jpn/m01109.mib
4809,mission_jpn/m01110.mib
4810,mission_jpn/m01111.mib
4811,mission_jpn/m01112.mib
4812,mission_jpn/m01113.mib
4813,mission_jpn/m01114.mib
4814,mission_jpn/m01115.mib
4815,mission_jpn/m01116.mib
4816,mission_jpn/m01117.mib
4817,mission_jpn/m01118.mib
4818,mission_jpn/m01119.mib
4819,mission_jpn/m01120.mib
4820,mission_jpn/m01121.mib
4821,mission_jpn/m01122.mib
4822,mission_jpn/m01123.mib
4823,mission_jpn/m01124.mib
4824,mission_jpn/m01125.mib
4825,mission_jpn/m01126.mib
4826,mission_jpn/m01201.mib
4827,mission_jpn/m01202.mib
4828,mission_jpn/m01203.mib
4829,mission_jpn/m01204.mib
4830,mission_jpn/m01205.mib
4831,mission_jpn/m01206.mib
4832,mission_jpn/m01207.mib
4833,mission_jpn/m01208.mib
4834,mission_jpn/m01209.mib
4835,mission_jpn/m01210.mib
4836,mission_jpn/m01211.mib
4837,mission_jpn/m01212.mib
4838,mission_jpn/m01213.mib
4839,mission_jpn/m01214.mib
4840,mission_jpn/m01215.mib
4841,mission_jpn/m01216.mib
4842,mission_jpn/m01217.mib
4843,mission_jpn/m01218.mib
4844,mission_jpn/m01219.mib
4845,mission_jpn/m01220.mib
4846,mission_jpn/m02001.mib
4847,mission_jpn/m02002.mib
4848,mission_jpn/m02003.mib
4849,mission_jpn/m02004.mib
4850,mission_jpn/m02005.mib
4851,mission_jpn/m02006.mib
4852,mission_jpn/m02007.mib
4853,mission_jpn/m02008.mib
4854,mission_jpn/m02009.mib
4855,mission_jpn/m02010.mib
4856,mission_jpn/m02011.mib
4857,mission_jpn/m02012.mib
4858,mission_jpn/m02013.mib
4859,mission_jpn/m02101.mib
4860,mission_jpn/m02102.mib
4861,mission_jpn/m02103.mib
4862,mission_jpn/m02104.mib
4863,mission_jpn/m02105.mib
4864,mission_jpn/m02106.mib
4865,mission_jpn/m02107.mib
4866,mission_jpn/m02108.mib
4867,mission_jpn/m02109.mib
4868,mission_jpn/m02110.mib
4869,mission_jpn/m02111.mib
4870,mission_jpn/m02112.mib
4871,mission_jpn/m02113.mib
4872,mission_jpn/m02114.mib
4873,mission_jpn/m02115.mib
4874,mission_jpn/m02116.mib
4875,mission_jpn/m02117.mib
4876,mission_jpn/m02118.mib
4877,mission_jpn/m02119.mib
4878,mission_jpn/m02120.mib
4879,mission_jpn/m02121.mib
4880,mission_jpn/m02122.mib
4881,mission_jpn/m02123.mib
4882,mission_jpn/m02124.mib
4883,mission_jpn/m02125.mib
4884,mission_jpn/m02126.mib
4885,mission_jpn/m02127.mib
4886,mission_jpn/m02201.mib
4887,mission_jpn/m02202.mib
4888,mission_jpn/m02203.mib
4889,mission_jpn/m02204.mib
4890,mission_jpn/m02205.mib
4891,mission_jpn/m02206.mib
4892,mission_jpn/m02207.mib
4893,mission_jpn/m02208.mib
4894,mission_jpn/m02209.mib
4895,mission_jpn/m02210.mib
4896,mission_jpn/m02211.mib
4897,mission_jpn/m02212.mib
4898,mission_jpn/m02213.mib
4899,mission_jpn/m02214.mib
4900,mission_jpn/m02215.mib
4901,mission_jpn/m02216.mib
4902,mission_jpn/m02217.mib
4903,mission_jpn/m02218.mib
4904,mission_jpn/m02219.mib
4905,mission_jpn/m02220.mib
4906,mission_jpn/m02221.mib
4907,mission_jpn/m02222.mib
4908,mission_jpn/m02223.mib
4909,mission_jpn/m02224.mib
4910,mission_jpn/m02225.mib
4911,mission_jpn/m02226.mib
4912,mission_jpn/m02227.mib
4913,mission_jpn/m02228.mib
4914,mission_jpn/m02229.mib
4915,mission_jpn/m02230.mib
4916,mission_jpn/m02231.mib
4917,mission_jpn/m02232.mib
4918,mission_jpn/m02233.mib
4919,mission_jpn/m02234.mib
4920,mission_jpn/m02235.mib
4921,mission_jpn/m02236.mib
4922,mission_jpn/m03001.mib
4923,mission_jpn/m03002.mib
4924,mission_jpn/m03003.mib
4925,mission_jpn/m03004.mib
4926,mission_jpn/m03005.mib
4927,mission_jpn/m03006.mib
4928,mission_jpn/m03007.mib
4929,mission_jpn/m03008.mib
4930,mission_jpn/m03009.mib
4931,mission_jpn/m03010.mib
4932,mission_jpn/m03011.mib
4933,mission_jpn/m03012.mib
4934,mission_jpn/m03013.mib
4935,mission_jpn/m03014.mib
4936,mission_jpn/m03015.mib
4937,mission_jpn/m03016.mib
4938,mission_jpn/m03017.mib
4939,mission_jpn/m03018.mib
4940,mission_jpn/m03019.mib
4941,mission_jpn/m03020.mib
4942,mission_jpn/m03021.mib
4943,mission_jpn/m03022.mib
4944,mission_jpn/m03023.mib
4945,mission_jpn/m03024.mib
4946,mission_jpn/m03025.mib
4947,mission_jpn/m03101.mib
4948,mission_jpn/m03102.mib
4949,mission_jpn/m03103.mib
4950,mission_jpn/m03104.mib
4951,mission_jpn/m03105.mib
4952,mission_jpn/m03106.mib
4953,mission_jpn/m03107.mib
4954,mission_jpn/m03108.mib
4955,mission_jpn/m03109.mib
4956,mission_jpn/m03110.mib
4957,mission_jpn/m03111.mib
4958,mission_jpn/m03112.mib
4959,mission_jpn/m03113.mib
4960,mission_jpn/m03114.mib
4961,mission_jpn/m03115.mib
4962,mission_jpn/m03116.mib
4963,mission_jpn/m03117.mib
4964,mission_jpn/m03118.mib
4965,mission_jpn/m03119.mib
4966,mission_jpn/m03120.mib
4967,mission_jpn/m03121.mib
4968,mission_jpn/m03122.mib
4969,mission_jpn/m03123.mib
4970,mission_jpn/m03124.mib
4971,mission_jpn/m03125.mib
4972,mission_jpn/m03126.mib
4973,mission_jpn/m03127.mib
4974,mission_jpn/m03201.mib
4975,mission_jpn/m03202.mib
4976,mission_jpn/m03203.mib
4977,mission_jpn/m03204.mib
4978,mission_jpn/m03205.mib
4979,mission_jpn/m03206.mib
4980,mission_jpn/m03207.mib
4981,mission_jpn/m03208.mib
4982,mission_jpn/m03209.mib
4983,mission_jpn/m03210.mib
4984,mission_jpn/m03211.mib
4985,mission_jpn/m03212.mib
4986,mission_jpn/m03213.mib
4987,mission_jpn/m03214.mib
4988,mission_jpn/m03215.mib
4989,mission_jpn/m03216.mib
4990,mission_jpn/m03217.mib
4991,mission_jpn/m03218.mib
4992,mission_jpn/m03219.mib
4993,mission_jpn/m03220.mib
4994,mission_jpn/m03221.mib
4995,mission_jpn/m03222.mib
4996,mission_jpn/m03223.mib
4997,mission_jpn/m03224.mib
4998,mission_jpn/m03225.mib
4999,mission_jpn/m03226.mib
5000,mission_jpn/m03227.mib
5001,mission_jpn/m03228.mib
5002,mission_jpn/m03229.mib
5003,mission_jpn/m03230.mib
5004,mission_jpn/m03231.mib
5005,mission_jpn/m03232.mib
5006,mission_jpn/m03233.mib
5007,mission_jpn/m04001.mib
5008,mission_jpn/m04002.mib
5009,mission_jpn/m04003.mib
5010,mission_jpn/m04004.mib
5011,mission_jpn/m04005.mib
5012,mission_jpn/m04006.mib
5013,mission_jpn/m04007.mib
5014,mission_jpn/m10001.mib
5015,mission_jpn/m10002.mib
5016,mission_jpn/m10003.mib
5017,mission_jpn/m10004.mib
5018,mission_jpn/m10005.mib
5019,mission_jpn/m10101.mib
5020,mission_jpn/m10102.mib
5021,mission_jpn/m10103.mib
5022,mission_jpn/m10104.mib
5023,mission_jpn/m10105.mib
5024,mission_jpn/m10106.mib
5025,mission_jpn/m10107.mib
5026,mission_jpn/m10108.mib
5027,mission_jpn/m10109.mib
5028,mission_jpn/m10110.mib
5029,mission_jpn/m10111.mib
5030,mission_jpn/m10112.mib
5031,mission_jpn/m10113.mib
5032,mission_jpn/m10114.mib
5033,mission_jpn/m10115.mib
5034,mission_jpn/m10116.mib
5035,mission_jpn/m10117.mib
5036,mission_jpn/m10118.mib
5037,mission_jpn/m10201.mib
5038,mission_jpn/m10202.mib
5039,mission_jpn/m10203.mib
5040,mission_jpn/m10204.mib
5041,mission_jpn/m10205.mib
5042,mission_jpn/m10206.mib
5043,mission_jpn/m10207.mib
5044,mission_jpn/m10208.mib
5045,mission_jpn/m10209.mib
5046,mission_jpn/m10210.mib
5047,mission_jpn/m10211.mib
5048,mission_jpn/m10212.mib
5049,mission_jpn/m10213.mib
5050,mission_jpn/m10214.mib
5051,mission_jpn/m10215.mib
5052,mission_jpn/m10216.mib
5053,mission_jpn/m10217.mib
5054,mission_jpn/m10218.mib
5055,mission_jpn/m10301.mib
5056,mission_jpn/m10302.mib
5057,mission_jpn/m10303.mib
5058,mission_jpn/m10304.mib
5059,mission_jpn/m10305.mib
5060,mission_jpn/m10306.mib
5061,mission_jpn/m10307.mib
5062,mission_jpn/m10308.mib
5063,mission_jpn/m10309.mib
5064,mission_jpn/m10310.mib
5065,mission_jpn/m10311.mib
5066,mission_jpn/m10312.mib
5067,mission_jpn/m10313.mib
5068,mission_jpn/m10314.mib
5069,mission_jpn/m10315.mib
5070,mission_jpn/m10316.mib
5071,mission_jpn/m10317.mib
5072,mission_jpn/m10318.mib
5073,mission_jpn/m10319.mib
5074,mission_jpn/m10401.mib
5075,mission_jpn/m10402.mib
5076,mission_jpn/m10403.mib
5077,mission_jpn/m10404.mib
5078,mission_jpn/m10405.mib
5079,mission_jpn/m10406.mib
5080,mission_jpn/m10407.mib
5081,mission_jpn/m10408.mib
5082,mission_jpn/m10409.mib
5083,mission_jpn/m10410.mib
5084,mission_jpn/m10411.mib
5085,mission_jpn/m10412.mib
5086,mission_jpn/m10413.mib
5087,mission_jpn/m10414.mib
5088,mission_jpn/m10415.mib
5089,mission_jpn/m10416.mib
5090,mission_jpn/m10417.mib
5091,mission_jpn/m10418.mib
5092,mission_jpn/m10501.mib
5093,mission_jpn/m10502.mib
5094,mission_jpn/m10503.mib
5095,mission_jpn/m10504.mib
5096,mission_jpn/m10505.mib
5097,mission_jpn/m10506.mib
5098,mission_jpn/m10507.mib
5099,mission_jpn/m10508.mib
5100,mission_jpn/m10509.mib
5101,mission_jpn/m10510.mib
5102,mission_jpn/m10511.mib
5103,mission_jpn/m11001.mib
5104,mission_jpn/m11002.mib
5105,mission_jpn/m11003.mib
5106,mission_jpn/m11004.mib
5107,mission_jpn/m11005.mib
5108,mission_jpn/m11006.mib
5109,mission_jpn/m11007.mib
5110,mission_jpn/m11008.mib
5111,mission_jpn/m11009.mib
5112,mission_jpn/m11010.mib
5113,mission_jpn/m11011.mib
5114,mission_jpn/m11012.mib
5115,mission_jpn/m11013.mib
5116,mission_jpn/m11014.mib
5117,mission_jpn/m11101.mib
5118,mission_jpn/m11102.mib
5119,mission_jpn/m11103.mib
5120,mission_jpn/m11104.mib
5121,mission_jpn/m11105.mib
5122,mission_jpn/m11106.mib
5123,mission_jpn/m11107.mib
5124,mission_jpn/m11108.mib
5125,mission_jpn/m11109.mib
5126,mission_jpn/m11110.mib
5127,mission_jpn/m11111.mib
5128,mission_jpn/m11112.mib
5129,mission_jpn/m11113.mib
5130,mission_jpn/m11114.mib
5131,mission_jpn/m11115.mib
5132,mission_jpn/m11116.mib
5133,mission_jpn/m11117.mib
5134,mission_jpn/m11118.mib
5135,mission_jpn/m11119.mib
5136,mission_jpn/m11201.mib
5137,mission_jpn/m11202.mib
5138,mission_jpn/m11203.mib
5139,mission_jpn/m11204.mib
5140,mission_jpn/m11205.mib
5141,mission_jpn/m11206.mib
5142,mission_jpn/m11207.mib
5143,mission_jpn/m11208.mib
5144,mission_jpn/m11209.mib
5145,mission_jpn/m11210.mib
5146,mission_jpn/m11211.mib
5147,mission_jpn/m11212.mib
5148,mission_jpn/m11213.mib
5149,mission_jpn/m11214.mib
5150,mission_jpn/m11215.mib
5151,mission_jpn/m11216.mib
5152,mission_jpn/m11217.mib
5153,mission_jpn/m11218.mib
5154,mission_jpn/m11219.mib
5155,mission_jpn/m11220.mib
5156,mission_jpn/m11221.mib
5157,mission_jpn/m11222.mib
5158,mission_jpn/m11223.mib
5159,mission_jpn/m11224.mib
5160,mission_jpn/m11225.mib
5161,mission_jpn/m11226.mib
5162,mission_jpn/m20001.mib
5163,mission_jpn/m20002.mib
5164,mission_jpn/m20003.mib
5165,mission_jpn/m20004.mib
5166,mission_jpn/m20005.mib
5167,mission_jpn/m20006.mib
5168,mission_jpn/m20007.mib
5169,mission_jpn/m20008.mib
5170,mission_jpn/m20009.mib
5171,mission_jpn/m20010.mib
5172,mission_jpn/m20011.mib
5173,mission_jpn/m20012.mib
5174,mission_jpn/m20013.mib
5175,mission_jpn/m20014.mib
5176,mission_jpn/m20015.mib
5177,mission_jpn/m20016.mib
5178,mission_jpn/m20017.mib
5179,mission_jpn/m20018.mib
5180,mission_jpn/m21001.mib
5181,mission_jpn/m21002.mib
5182,mission_jpn/m21003.mib
5183,mission_jpn/m21004.mib
5184,mission_jpn/m21005.mib
5185,mission_jpn/m21006.mib
5186,mission_jpn/m21007.mib
5187,mission_jpn/m21008.mib
5188,mission_jpn/m21009.mib
5189,mission_jpn/m21010.mib
5190,mission_jpn/m21011.mib
5191,mission_jpn/m21012.mib
5192,mission_jpn/m21013.mib
5193,mission_jpn/m21014.mib
5194,mission_jpn/m21015.mib
5195,mission_jpn/m21016.mib
5196,mission_jpn/m21017.mib
5197,mission_jpn/m21018.mib
5198,mission_jpn/m21019.mib
5199,mission_jpn/m21020.mib
5200,mission_jpn/m21021.mib
5201,mission_jpn/m21022.mib
5202,mission_jpn/m21023.mib
5203,mission_jpn/m22001.mib
5204,mission_jpn/m22002.mib
5205,mission_jpn/m22003.mib
5206,mission_jpn/m22004.mib
5207,mission_jpn/m22005.mib
5208,mission_jpn/m22006.mib
5209,mission_jpn/m30001.mib
5210,mission_jpn/m30002.mib
5211,mission_jpn/m30003.mib
5212,mission_jpn/m30004.mib
5213,mission_jpn/m30005.mib
5214,mission_jpn/m30006.mib
5215,mission_jpn/m30007.mib
5216,mission_jpn/m30008.mib
5217,mission_jpn/m30009.mib
5218,mission_jpn/m30010.mib
5219,mission_jpn/m30011.mib
5220,mission_jpn/m30012.mib
5221,mission_jpn/m30013.mib
5222,mission_jpn/m30014.mib
5223,mission_jpn/m30015.mib
5224,mission_jpn/m30016.mib
5225,mission_jpn/m30017.mib
5226,mission_jpn/m30018.mib
5227,mission_jpn/m30019.mib
5228,mission_jpn/m30020.mib
5229,mission_jpn/m30021.mib
5230,mission_jpn/m30022.mib
5231,mission_jpn/m30023.mib
5232,mission_jpn/m30024.mib
5233,mission_jpn/m30025.mib
5234,mission_jpn/m30026.mib
5235,mission_jpn/m30027.mib
5236,mission_jpn/m30028.mib
5237,mission_jpn/m30029.mib
5238,mission_jpn/m30030.mib
5239,mission_jpn/m30031.mib
5240,mission_jpn/m30032.mib
5241,mission_jpn/m30033.mib
5242,mission_jpn/m30034.mib
5243,mission_jpn/m30035.mib
5244,mission_jpn/m30036.mib
5245,mission_jpn/m30037.mib
5246,mission_jpn/m30038.mib
5247,mission_jpn/m30039.mib
5248,mission_jpn/m30040.mib
5249,mission_jpn/m30041.mib
5250,mission_jpn/m30042.mib
5251,mission_jpn/m30043.mib
5252,mission_jpn/m30044.mib
5253,mission_jpn/m30045.mib
5254,mission_jpn/m30046.mib
5255,mission_jpn/m30047.mib
5256,mission_jpn/m30048.mib
5257,mission_jpn/m30049.mib
5258,mission_jpn/m30050.mib
5259,mission_jpn/m30051.mib
5260,mission_jpn/m30052.mib
5261,mission_jpn/m30053.mib
5262,mission_jpn/m30054.mib
5263,mission_jpn/m30055.mib
5264,mission_jpn/m30056.mib
5265,mission_jpn/m30057.mib
5266,mission_jpn/m30058.mib
5267,mission_jpn/m30059.mib
5268,mission_jpn/m30060.mib
5269,mission_jpn/m30061.mib
5270,mission_jpn/m30062.mib
5271,mission_jpn/m30063.mib
5272,mission_jpn/m30064.mib
5273,mission_jpn/m30065.mib
5274,mission_jpn/m30066.mib
5275,mission_jpn/m30067.mib
5276,mission_jpn/m30068.mib
5277,mission_jpn/m30069.mib
5278,mission_jpn/m30070.mib
5279,mission_jpn/m30071.mib
5280,mission_jpn/m30072.mib
5281,mission_jpn/m30073.mib
5282,mission_jpn/m30074.mib
5283,mission_jpn/m30075.mib
5284,mission_jpn/m30076.mib
5285,mission_jpn/m30077.mib
5286,mission_jpn/m30078.mib
5287,mission_jpn/m30079.mib
5288,mission_jpn/m30080.mib
5289,mission_jpn/m30081.mib
5290,mission_jpn/m30082.mib
5291,mission_jpn/m30083.mib
5292,mission_jpn/m30084.mib
5293,mission_jpn/m30085.mib
5294,mission_jpn/m30086.mib
5295,mission_jpn/m30087.mib
5296,mission_jpn/m30088.mib
5297,mission_jpn/m30089.mib
5298,mission_jpn/m30090.mib
5299,mission_jpn/m40001.mib
5300,mission_jpn/m40002.mib
5301,mission_jpn/m40003.mib
5302,mission_jpn/m40004.mib
5303,mission_jpn/m40005.mib
5304,mission_jpn/m40006.mib
5305,mission_jpn/m40007.mib
5306,mission_jpn/m40008.mib
5307,mission_jpn/m50001.mib
5308,mission_jpn/m50002.mib
5309,mission_jpn/m50003.mib
5310,mission_jpn/level1.mib
5311,mission_jpn/level2.mib
5312,mission_jpn/level3.mib
5313,mission_jpn/level4.mib
5314,mission_jpn/level5.mib
5315,mission_jpn/level6.mib
5316,mission_jpn/level7.mib
5317,mission_jpn/level8.mib
5318,mission_jpn/level9.mib
5319,mission_jpn/level10.mib
5320,mission_jpn/level11.mib
5321,mission_jpn/levelx.mib
5322,mission_jpn/levela.mib
5323,cockpit/cock.tmh
5324,cockpit/map1.tmh
5325,cockpit/map2.tmh
5326,cockpit/map3.tmh
5327,cockpit/map4.tmh
5328,cockpit/map5.tmh
5329,cockpit/map6.tmh
5330,cockpit/map7.tmh
5331,cockpit/map8.tmh
5332,cockpit/map9.tmh
5333,cockpit/map10.tmh
5334,cockpit/map11.tmh
5335,cockpit/map11_1.tmh
5336,cockpit/map11_2.tmh
5337,cockpit/map12.tmh
5338,cockpit/map13.tmh
5339,cockpit/map14.tmh
5340,cockpit/map15.tmh
5341,cockpit/map17.tmh
5342,cockpit/map19.tmh
5343,cockpit/map20.tmh
5344,cockpit/map22.tmh
5345,cockpit/map23.tmh
5346,cockpit/map26.tmh
5347,cockpit/map27.tmh
5348,cockpit/map28.tmh
5349,cockpit/map29.tmh
5350,cockpit/map30.tmh
5351,npc/npc_00.pac
5352,npc/npc_01.pac
5353,npc/npc_02.pac
5354,npc/npc_03.pac
5355,npc/npc_04_00.pac
5356,npc/npc_04_04.pac
5357,npc/npc_04_01.pac
5358,npc/npc_04_02.pac
5359,npc/npc_04_03.pac
5360,npc/npc_04_05.pac
5361,npc/npc_04_06.pac
5362,npc/npc_04_07.pac
5363,cat/cat_00.pac
5364,motion/ac_com_tbl.bin
5365,motion/air_com_tbl.bin
5366,motion/lbcom_tbl.bin
5367,motion/min_com_tbl.bin
5368,motion/selcom_tbl.bin
5369,message_jpn/meeting.bin
5370,message_jpn/village.bin
5371,message_jpn/farm.bin
5372,message_jpn/kitchen.bin
5373,sound/se/snd_012a.bd
5374,sound/se/snd_012a.phd
5375,sound/se/snd_ailuk.bd
5376,sound/se/snd_ailuk.phd
5377,sound/se/snd_ailuk.tsb
5378,sound/se/snd_common00.bd
5379,sound/se/snd_common00.phd
5380,sound/se/snd_common00.tsb
5381,sound/se/snd_common01.bd
5382,sound/se/snd_common01.phd
5383,sound/se/snd_common01.tsb
5384,sound/se/snd_commonCH.bd
5385,sound/se/snd_commonCH.phd
5386,sound/se/snd_commonCH.tsb
5387,sound/se/snd_editpl.bd
5388,sound/se/snd_editpl.phd
5389,sound/se/snd_editpl.tsb
5390,sound/se/snd_event.bd
5391,sound/se/snd_event.phd
5392,sound/se/snd_event.tsb
5393,sound/se/snd_infra.phd
5394,sound/se/snd_infra.tsb
5395,sound/se/snd_infra.bd
5396,sound/se/snd_kyoukan.bd
5397,sound/se/snd_kyoukan.phd
5398,sound/se/snd_kyoukan.tsb
5399,sound/se/snd_ma_0.bd
5400,sound/se/snd_ma_0.phd
5401,sound/se/snd_map.tsb
5402,sound/se/snd_mapch.bd
5403,sound/se/snd_mapch.phd
5404,sound/se/snd_mapev.bd
5405,sound/se/snd_mapev.phd
5406,sound/se/snd_md_0.bd
5407,sound/se/snd_md_0.phd
5408,sound/se/snd_md20.bd
5409,sound/se/snd_md20.phd
5410,sound/se/snd_meet.bd
5411,sound/se/snd_meet.phd
5412,sound/se/snd_meet.tsb
5413,sound/se/snd_mg20.bd
5414,sound/se/snd_mg20.phd
5415,sound/se/snd_mj_0.bd
5416,sound/se/snd_mj_0.phd
5417,sound/se/snd_mjcp.bd
5418,sound/se/snd_mjcp.phd
5419,sound/se/snd_mjdk.bd
5420,sound/se/snd_mjdk.phd
5421,sound/se/snd_mk_0.bd
5422,sound/se/snd_mk_0.phd
5423,sound/se/snd_mm_0.bd
5424,sound/se/snd_mm_0.phd
5425,sound/se/snd_mmcp.bd
5426,sound/se/snd_mmcp.phd
5427,sound/se/snd_mn_0.bd
5428,sound/se/snd_mn_0.phd
5429,sound/se/snd_mn_1.bd
5430,sound/se/snd_mn_1.phd
5431,sound/se/snd_mn_2.bd
5432,sound/se/snd_mn_2.phd
5433,sound/se/snd_mn_3.bd
5434,sound/se/snd_mn_3.phd
5435,sound/se/snd_mncp.bd
5436,sound/se/snd_mncp.phd
5437,sound/se/snd_mndk.bd
5438,sound/se/snd_mndk.phd
5439,sound/se/snd_mr_0.bd
5440,sound/se/snd_mr_0.phd
5441,sound/se/snd_mr_3.bd
5442,sound/se/snd_mr_3.phd
5443,sound/se/snd_ms_0.bd
5444,sound/se/snd_ms_0.phd
5445,sound/se/snd_mt_0.bd
5446,sound/se/snd_mt_0.phd
5447,sound/se/snd_mv_0.bd
5448,sound/se/snd_mv_0.phd
5449,sound/se/snd_my_0.bd
5450,sound/se/snd_my_0.phd
5451,sound/se/snd_my_1.bd
5452,sound/se/snd_my_1.phd
5453,sound/se/snd_mycp.bd
5454,sound/se/snd_mycp.phd
5455,sound/se/snd_mydk.bd
5456,sound/se/snd_mydk.phd
5457,sound/se/snd_result.bd
5458,sound/se/snd_result.phd
5459,sound/se/snd_system.bd
5460,sound/se/snd_system.phd
5461,sound/se/snd_system.tsb
5462,sound/se/snd_town.bd
5463,sound/se/snd_town.phd
5464,sound/se/snd_town.tsb
5465,sound/se/snd_mj_0_p1.bd
5466,sound/se/snd_mj_0_p1.phd
5467,sound/se/snd_mk_0_p1.bd
5468,sound/se/snd_mk_0_p1.phd
5469,sound/se/snd_mn_0_p1.bd
5470,sound/se/snd_mn_0_p1.phd
5471,sound/se/snd_ms_0_p1.bd
5472,sound/se/snd_ms_0_p1.phd
5473,sound/se/snd_mykj.bd
5474,sound/se/snd_mykj.phd
5475,sound/se/snd_mz_0.bd
5476,sound/se/snd_mz_0.phd
5477,sound/se/snd_npcailu.bd
5478,sound/se/snd_npcailu.phd
5479,sound/se/snd_npcailu.tsb
5480,sound/se/snd_ailuwep05.bd
5481,sound/se/snd_ailuwep05.phd
5482,sound/se/snd_ailuwep07.bd
5483,sound/se/snd_ailuwep07.phd
5484,sound/se/snd_ailuwep08.bd
5485,sound/se/snd_ailuwep08.phd
5486,sound/se/snd_ailuwep09.bd
5487,sound/se/snd_ailuwep09.phd
5488,sound/se/snd_ailuwep11.bd
5489,sound/se/snd_ailuwep11.phd
5490,overlay/stage000.ovl
5491,overlay/stage001.ovl
5492,overlay/stage002.ovl
5493,overlay/stage003.ovl
5494,overlay/stage004.ovl
5495,overlay/stage005.ovl
5496,overlay/stage006.ovl
5497,overlay/stage007.ovl
5498,overlay/stage008.ovl
5499,overlay/stage009.ovl
5500,overlay/stage010.ovl
5501,overlay/stage011.ovl
5502,overlay/stage012.ovl
5503,overlay/stage013.ovl
5504,overlay/stage014.ovl
5505,overlay/stage015.ovl
5506,overlay/stage016.ovl
5507,overlay/stage017.ovl
5508,overlay/stage018.ovl
5509,overlay/stage019.ovl
5510,overlay/stage020.ovl
5511,overlay/stage021.ovl
5512,overlay/stage022.ovl
5513,overlay/stage023.ovl
5514,overlay/stage024.ovl
5515,overlay/stage025.ovl
5516,overlay/stage026.ovl
5517,overlay/stage027.ovl
5518,overlay/stage028.ovl
5519,overlay/stage029.ovl
5520,overlay/stage030.ovl
5521,overlay/stage031.ovl
5522,overlay/stage032.ovl
5523,overlay/stage033.ovl
5524,overlay/stage034.ovl
5525,overlay/stage035.ovl
5526,overlay/stage036.ovl
5527,overlay/stage037.ovl
5528,overlay/stage038.ovl
5529,overlay/stage039.ovl
5530,overlay/stage040.ovl
5531,overlay/stage041.ovl
5532,overlay/stage042.ovl
5533,overlay/stage043.ovl
5534,overlay/stage044.ovl
5535,overlay/stage045.ovl
5536,overlay/stage046.ovl
5537,overlay/stage047.ovl
5538,overlay/stage048.ovl
5539,overlay/stage049.ovl
5540,overlay/stage050.ovl
5541,overlay/stage051.ovl
5542,overlay/stage052.ovl
5543,overlay/stage053.ovl
5544,overlay/stage054.ovl
5545,overlay/stage055.ovl
5546,overlay/stage056.ovl
5547,overlay/stage057.ovl
5548,overlay/stage058.ovl
5549,overlay/stage059.ovl
5550,overlay/stage060.ovl
5551,overlay/stage061.ovl
5552,overlay/stage062.ovl
5553,overlay/stage063.ovl
5554,overlay/stage064.ovl
5555,overlay/stage065.ovl
5556,overlay/stage066.ovl
5557,overlay/stage067.ovl
5558,overlay/stage068.ovl
5559,overlay/stage069.ovl
5560,overlay/stage070.ovl
5561,overlay/stage071.ovl
5562,overlay/stage072.ovl
5563,overlay/stage073.ovl
5564,overlay/stage074.ovl
5565,overlay/stage075.ovl
5566,overlay/stage076.ovl
5567,overlay/stage077.ovl
5568,overlay/stage078.ovl
5569,overlay/stage079.ovl
5570,overlay/stage080.ovl
5571,overlay/stage081.ovl
5572,overlay/stage082.ovl
5573,overlay/stage083.ovl
5574,overlay/stage084.ovl
5575,overlay/stage085.ovl
5576,overlay/stage086.ovl
5577,overlay/stage087.ovl
5578,overlay/stage088.ovl
5579,overlay/stage089.ovl
5580,overlay/stage090.ovl
5581,overlay/stage091.ovl
5582,overlay/stage092.ovl
5583,overlay/stage093.ovl
5584,overlay/stage094.ovl
5585,overlay/stage095.ovl
5586,overlay/stage096.ovl
5587,overlay/stage097.ovl
5588,overlay/stage098.ovl
5589,overlay/stage099.ovl
5590,overlay/stage100.ovl
5591,overlay/stage101.ovl
5592,overlay/stage102.ovl
5593,overlay/stage103.ovl
5594,overlay/stage104.ovl
5595,overlay/stage105.ovl
5596,overlay/stage106.ovl
5597,overlay/stage107.ovl
5598,overlay/stage108.ovl
5599,overlay/stage109.ovl
5600,overlay/stage110.ovl
5601,overlay/stage111.ovl
5602,overlay/stage112.ovl
5603,overlay/stage113.ovl
5604,overlay/stage114.ovl
5605,overlay/stage115.ovl
5606,overlay/stage116.ovl
5607,overlay/stage117.ovl
5608,overlay/stage118.ovl
5609,overlay/stage119.ovl
5610,overlay/stage120.ovl
5611,overlay/stage121.ovl
5612,overlay/stage122.ovl
5613,overlay/stage123.ovl
5614,overlay/stage124.ovl
5615,overlay/stage125.ovl
5616,overlay/stage126.ovl
5617,overlay/stage127.ovl
5618,overlay/stage128.ovl
5619,overlay/stage129.ovl
5620,overlay/stage130.ovl
5621,overlay/stage131.ovl
5622,overlay/stage132.ovl
5623,overlay/stage133.ovl
5624,overlay/stage134.ovl
5625,overlay/stage135.ovl
5626,overlay/stage136.ovl
5627,overlay/stage137.ovl
5628,overlay/stage138.ovl
5629,overlay/stage139.ovl
5630,overlay/stage140.ovl
5631,overlay/stage141.ovl
5632,overlay/stage142.ovl
5633,overlay/stage143.ovl
5634,overlay/stage144.ovl
5635,overlay/stage145.ovl
5636,overlay/stage146.ovl
5637,overlay/stage147.ovl
5638,overlay/stage148.ovl
5639,overlay/stage149.ovl
5640,overlay/stage150.ovl
5641,overlay/stage151.ovl
5642,overlay/stage152.ovl
5643,overlay/stage153.ovl
5644,overlay/stage154.ovl
5645,overlay/stage155.ovl
5646,overlay/stage156.ovl
5647,overlay/stage157.ovl
5648,overlay/stage158.ovl
5649,overlay/stage159.ovl
5650,overlay/stage160.ovl
5651,overlay/stage161.ovl
5652,overlay/stage162.ovl
5653,overlay/stage163.ovl
5654,overlay/stage164.ovl
5655,overlay/stage165.ovl
5656,overlay/stage166.ovl
5657,overlay/stage167.ovl
5658,overlay/stage168.ovl
5659,overlay/stage169.ovl
5660,overlay/stage170.ovl
5661,overlay/stage171.ovl
5662,overlay/stage172.ovl
5663,overlay/stage173.ovl
5664,overlay/stage174.ovl
5665,overlay/stage175.ovl
5666,overlay/stage176.ovl
5667,overlay/stage177.ovl
5668,overlay/stage178.ovl
5669,overlay/stage179.ovl
5670,overlay/stage180.ovl
5671,overlay/stage181.ovl
5672,overlay/stage182.ovl
5673,overlay/stage183.ovl
5674,overlay/stage184.ovl
5675,overlay/stage185.ovl
5676,overlay/stage186.ovl
5677,overlay/stage187.ovl
5678,overlay/stage188.ovl
5679,overlay/stage189.ovl
5680,overlay/stage190.ovl
5681,overlay/stage191.ovl
5682,overlay/stage192.ovl
5683,overlay/stage193.ovl
5684,overlay/stage194.ovl
5685,overlay/stage195.ovl
5686,overlay/stage196.ovl
5687,overlay/stage197.ovl
5688,overlay/stage198.ovl
5689,overlay/stage199.ovl
5690,overlay/stage200.ovl
5691,overlay/stage201.ovl
5692,overlay/stage202.ovl
5693,overlay/stage203.ovl
5694,overlay/stage204.ovl
5695,overlay/stage205.ovl
5696,overlay/stage206.ovl
5697,overlay/stage207.ovl
5698,overlay/stage208.ovl
5699,overlay/stage209.ovl
5700,overlay/stage210.ovl
5701,overlay/stage211.ovl
5702,overlay/stage212.ovl
5703,overlay/stage213.ovl
5704,overlay/stage214.ovl
5705,overlay/stage215.ovl
5706,overlay/stage216.ovl
5707,overlay/stage217.ovl
5708,overlay/stage218.ovl
5709,overlay/stage219.ovl
5710,overlay/stage220.ovl
5711,overlay/stage221.ovl
5712,overlay/stage222.ovl
5713,overlay/stage223.ovl
5714,overlay/stage224.ovl
5715,overlay/stage225.ovl
5716,overlay/stage226.ovl
5717,overlay/stage227.ovl
5718,overlay/stage228.ovl
5719,overlay/stage229.ovl
5720,overlay/stage230.ovl
5721,overlay/stage231.ovl
5722,overlay/stage232.ovl
5723,overlay/stage233.ovl
5724,overlay/stage234.ovl
5725,overlay/stage235.ovl
5726,overlay/stage236.ovl
5727,overlay/stage237.ovl
5728,overlay/stage238.ovl
5729,overlay/stage239.ovl
5730,overlay/stage240.ovl
5731,overlay/stage241.ovl
5732,overlay/stage242.ovl
5733,overlay/stage243.ovl
5734,overlay/stage244.ovl
5735,overlay/stage245.ovl
5736,overlay/stage246.ovl
5737,overlay/stage247.ovl
5738,overlay/stage248.ovl
5739,overlay/stage249.ovl
5740,overlay/stage250.ovl
5741,overlay/stage251.ovl
5742,overlay/stage252.ovl
5743,overlay/stage253.ovl
5744,overlay/stage254.ovl
5745,overlay/stage255.ovl
5746,overlay/stage256.ovl
5747,overlay/stage257.ovl
5748,overlay/stage258.ovl
5749,overlay/stage259.ovl
5750,overlay/stage260.ovl
5751,overlay/stage261.ovl
5752,overlay/stage262.ovl
5753,overlay/stage263.ovl
5754,overlay/stage264.ovl
5755,overlay/stage265.ovl
5756,overlay/stage266.ovl
5757,stage/st001.pac
5758,stage/st002.pac
5759,stage/st003.pac
5760,stage/st004.pac
5761,stage/st005.pac
5762,stage/st006.pac
5763,stage/st007.pac
5764,stage/st008.pac
5765,stage/st009.pac
5766,stage/st010.pac
5767,stage/st011.pac
5768,stage/st012.pac
5769,stage/st013.pac
5770,stage/st014.pac
5771,stage/st015.pac
5772,stage/st016.pac
5773,stage/st017.pac
5774,stage/st018.pac
5775,stage/st019.pac
5776,stage/st020.pac
5777,stage/st021.pac
5778,stage/st022.pac
5779,stage/st023.pac
5780,stage/st024.pac
5781,stage/st025.pac
5782,stage/st026.pac
5783,stage/st027.pac
5784,stage/st028.pac
5785,stage/st029.pac
5786,stage/st030.pac
5787,stage/st031.pac
5788,stage/st032.pac
5789,stage/st033.pac
5790,stage/st034.pac
5791,stage/st035.pac
5792,stage/st036.pac
5793,stage/st037.pac
5794,stage/st038.pac
5795,stage/st039.pac
5796,stage/st040.pac
5797,stage/st041.pac
5798,stage/st042.pac
5799,stage/st043.pac
5800,stage/st044.pac
5801,stage/st045.pac
5802,stage/st046.pac
5803,stage/st047.pac
5804,stage/st048.pac
5805,stage/st049.pac
5806,stage/st050.pac
5807,stage/st051.pac
5808,stage/st052.pac
5809,stage/st053.pac
5810,stage/st054.pac
5811,stage/st055.pac
5812,stage/st056.pac
5813,stage/st057.pac
5814,stage/st058.pac
5815,stage/st059.pac
5816,stage/st060.pac
5817,stage/st061.pac
5818,stage/st062.pac
5819,stage/st063.pac
5820,stage/st064.pac
5821,stage/st065.pac
5822,stage/st066.pac
5823,stage/st067.pac
5824,stage/st068.pac
5825,stage/st069.pac
5826,stage/st070.pac
5827,stage/st071.pac
5828,stage/st072.pac
5829,stage/st073.pac
5830,stage/st074.pac
5831,stage/st075.pac
5832,stage/st076.pac
5833,stage/st077.pac
5834,stage/st078.pac
5835,stage/st079.pac
5836,stage/st080.pac
5837,stage/st081.pac
5838,stage/st082.pac
5839,stage/st083.pac
5840,stage/st084.pac
5841,stage/st085.pac
5842,stage/st086.pac
5843,stage/st087.pac
5844,stage/st088.pac
5845,stage/st089.pac
5846,stage/st090.pac
5847,stage/st091.pac
5848,stage/st092.pac
5849,stage/st093.pac
5850,stage/st094.pac
5851,stage/st095.pac
5852,stage/st096.pac
5853,stage/st097.pac
5854,stage/st098.pac
5855,stage/st099.pac
5856,stage/st100.pac
5857,stage/st101.pac
5858,stage/st102.pac
5859,stage/st103.pac
5860,stage/st104.pac
5861,stage/st105.pac
5862,stage/st106.pac
5863,stage/st107.pac
5864,stage/st108.pac
5865,stage/st109.pac
5866,stage/st110.pac
5867,stage/st111.pac
5868,stage/st112.pac
5869,stage/st113.pac
5870,stage/st114.pac
5871,stage/st115.pac
5872,stage/st116.pac
5873,stage/st117.pac
5874,stage/st118.pac
5875,stage/st119.pac
5876,stage/st120.pac
5877,stage/st121.pac
5878,stage/st122.pac
5879,stage/st123.pac
5880,stage/st124.pac
5881,stage/st125.pac
5882,stage/st126.pac
5883,stage/st127.pac
5884,stage/st128.pac
5885,stage/st129.pac
5886,stage/st130.pac
5887,stage/st131.pac
5888,stage/st132.pac
5889,stage/st133.pac
5890,stage/st134.pac
5891,stage/st135.pac
5892,stage/st136.pac
5893,stage/st137.pac
5894,stage/st138.pac
5895,stage/st139.pac
5896,stage/st140.pac
5897,stage/st141.pac
5898,stage/st142.pac
5899,stage/st143.pac
5900,stage/st144.pac
5901,stage/st145.pac
5902,stage/st146.pac
5903,stage/st147.pac
5904,stage/st148.pac
5905,stage/st149.pac
5906,stage/st150.pac
5907,stage/st151.pac
5908,stage/st152.pac
5909,stage/st153.pac
5910,stage/st154.pac
5911,stage/st155.pac
5912,stage/st156.pac
5913,stage/st157.pac
5914,stage/st158.pac
5915,stage/st159.pac
5916,stage/st160.pac
5917,stage/st161.pac
5918,stage/st162.pac
5919,stage/st163.pac
5920,stage/st164.pac
5921,stage/st165.pac
5922,stage/st166.pac
5923,stage/st167.pac
5924,stage/st168.pac
5925,stage/st169.pac
5926,stage/st170.pac
5927,stage/st171.pac
5928,stage/st172.pac
5929,stage/st173.pac
5930,stage/st174.pac
5931,stage/st175.pac
5932,stage/st176.pac
5933,stage/st177.pac
5934,stage/st178.pac
5935,stage/st179.pac
5936,stage/st180.pac
5937,stage/st181.pac
5938,stage/st182.pac
5939,stage/st183.pac
5940,stage/st184.pac
5941,stage/st185.pac
5942,stage/st186.pac
5943,stage/st187.pac
5944,stage/st188.pac
5945,stage/st189.pac
5946,stage/st190.pac
5947,stage/st191.pac
5948,stage/st192.pac
5949,stage/st193.pac
5950,stage/st194.pac
5951,stage/st195.pac
5952,stage/st196.pac
5953,stage/st197.pac
5954,stage/st198.pac
5955,stage/st199.pac
5956,stage/st200.pac
5957,stage/st201.pac
5958,stage/st202.pac
5959,stage/st203.pac
5960,stage/st204.pac
5961,stage/st205.pac
5962,stage/st206.pac
5963,stage/st207.pac
5964,stage/st208.pac
5965,stage/st209.pac
5966,stage/st210.pac
5967,stage/st211.pac
5968,stage/st212.pac
5969,stage/st213.pac
5970,stage/st214.pac
5971,stage/st215.pac
5972,stage/st216.pac
5973,stage/st217.pac
5974,stage/st218.pac
5975,stage/st219.pac
5976,stage/st220.pac
5977,stage/st221.pac
5978,stage/st222.pac
5979,stage/st223.pac
5980,stage/st224.pac
5981,stage/st225.pac
5982,stage/st226.pac
5983,stage/st227.pac
5984,stage/st228.pac
5985,stage/st229.pac
5986,stage/st230.pac
5987,stage/st231.pac
5988,stage/st232.pac
5989,stage/st233.pac
5990,stage/st234.pac
5991,stage/st235.pac
5992,stage/st236.pac
5993,stage/st237.pac
5994,stage/st238.pac
5995,stage/st239.pac
5996,stage/st240.pac
5997,stage/st241.pac
5998,stage/st242.pac
5999,stage/st243.pac
6000,stage/st244.pac
6001,stage/st245.pac
6002,stage/st246.pac
6003,stage/st247.pac
6004,stage/st248.pac
6005,stage/st249.pac
6006,stage/st250.pac
6007,stage/st251.pac
6008,stage/st252.pac
6009,stage/st253.pac
6010,stage/st254.pac
6011,stage/st255.pac
6012,stage/st256.pac
6013,stage/st257.pac
6014,stage/st258.pac
6015,stage/st259.pac
6016,stage/st260.pac
6017,stage/st261.pac
6018,stage/st262.pac
6019,stage/st263.pac
6020,stage/st264.pac
6021,stage/st265.pac
6022,stage/st266.pac
6023,stage/st046_1a.pac
6024,stage/st046_2a.pac
6025,stage/st046_3a.pac
6026,stage/st046_4a.pac
6027,stage/st046_1b.pac
6028,stage/st046_2b.pac
6029,stage/st046_3b.pac
6030,stage/st046_4b.pac
6031,stage/st046_1c.pac
6032,stage/st046_2c.pac
6033,stage/st046_3c.pac
6034,stage/st046_4c.pac
6035,stage/st046_1d.pac
6036,stage/st046_2d.pac
6037,stage/st046_3d.pac
6038,stage/st046_4d.pac
6039,effect/ef_00.pac
6040,effect/ef_01.pac
6041,effect/ef_02.pac
6042,effect/ef_03.pac
6043,overlay/em01.ovl
6044,overlay/em02.ovl
6045,overlay/em07.ovl
6046,overlay/em14.ovl
6047,overlay/em15.ovl
6048,overlay/em17.ovl
6049,overlay/em20.ovl
6050,overlay/em21.ovl
6051,overlay/em33.ovl
6052,overlay/em40.ovl
6053,overlay/em54.ovl
6054,overlay/em55.ovl
6055,overlay/em58.ovl
6056,overlay/em59.ovl
6057,overlay/em75.ovl
6058,overlay/em82.ovl
6059,overlay/em83.ovl
6060,emmodel/em01.pac
6061,emmodel/em02.pac
6062,emmodel/em03.pac
6063,emmodel/em04.pac
6064,emmodel/em05.pac
6065,emmodel/em06.pac
6066,emmodel/em07.pac
6067,emmodel/em08.pac
6068,emmodel/em09.pac
6069,emmodel/em10.pac
6070,emmodel/em11.pac
6071,emmodel/em12.pac
6072,emmodel/em13.pac
6073,emmodel/em14.pac
6074,emmodel/em15.pac
6075,emmodel/em16.pac
6076,emmodel/em17.pac
6077,emmodel/em18.pac
6078,emmodel/em19.pac
6079,emmodel/em20.pac
6080,emmodel/em21.pac
6081,emmodel/em22.pac
6082,emmodel/em23.pac
6083,emmodel/em24.pac
6084,emmodel/em25.pac
6085,emmodel/em26.pac
6086,emmodel/em27.pac
6087,emmodel/em28.pac
6088,emmodel/em29.pac
6089,emmodel/em30.pac
6090,emmodel/em31.pac
6091,emmodel/em32.pac
6092,emmodel/em33.pac
6093,emmodel/em34.pac
6094,emmodel/em35.pac
6095,emmodel/em36.pac
6096,emmodel/em37.pac
6097,emmodel/em38.pac
6098,emmodel/em39.pac
6099,emmodel/em40.pac
6100,emmodel/em41.pac
6101,emmodel/em42.pac
6102,emmodel/em43.pac
6103,emmodel/em44.pac
6104,emmodel/em45.pac
6105,emmodel/em46.pac
6106,emmodel/em47.pac
6107,emmodel/em48.pac
6108,emmodel/em49.pac
6109,emmodel/em50.pac
6110,emmodel/em51.pac
6111,emmodel/em52.pac
6112,emmodel/em53.pac
6113,emmodel/em54.pac
6114,emmodel/em55.pac
6115,emmodel/em56.pac
6116,emmodel/em57.pac
6117,emmodel/em58.pac
6118,emmodel/em59.pac
6119,emmodel/em60.pac
6120,emmodel/em61.pac
6121,emmodel/em62.pac
6122,emmodel/em63.pac
6123,emmodel/em64.pac
6124,emmodel/em65.pac
6125,emmodel/em66.pac
6126,emmodel/em67.pac
6127,emmodel/em68.pac
6128,emmodel/em69.pac
6129,emmodel/em70.pac
6130,emmodel/em71.pac
6131,emmodel/em72.pac
6132,emmodel/em73.pac
6133,emmodel/em74.pac
6134,emmodel/em75.pac
6135,emmodel/em76.pac
6136,emmodel/em77.pac
6137,emmodel/em78.pac
6138,emmodel/em79.pac
6139,emmodel/em80.pac
6140,emmodel/em81.pac
6141,emmodel/em82.pac
6142,emmodel/em83.pac
6143,emmodel/em84.pac
6144,emmodel/em85.pac
6145,emmodel/em86.pac
6146,emmodel/em87.pac
6147,emmodel/em88.pac
6148,emmodel/em89.pac
6149,sound/se/snd_em01.phd
6150,sound/se/snd_em01.bd
6151,sound/se/snd_em01.tsb
6152,sound/se/snd_em02.phd
6153,sound/se/snd_em02.bd
6154,sound/se/snd_em02.tsb
6155,sound/se/snd_em03.phd
6156,sound/se/snd_em03.bd
6157,sound/se/snd_em03.tsb
6158,sound/se/snd_em04.phd
6159,sound/se/snd_em04.bd
6160,sound/se/snd_em04.tsb
6161,sound/se/snd_em05.phd
6162,sound/se/snd_em05.bd
6163,sound/se/snd_em05.tsb
6164,sound/se/snd_em06.phd
6165,sound/se/snd_em06.bd
6166,sound/se/snd_em06.tsb
6167,sound/se/snd_em07.phd
6168,sound/se/snd_em07.bd
6169,sound/se/snd_em07.tsb
6170,sound/se/snd_em08.phd
6171,sound/se/snd_em08.bd
6172,sound/se/snd_em08.tsb
6173,sound/se/snd_em09.phd
6174,sound/se/snd_em09.bd
6175,sound/se/snd_em09.tsb
6176,sound/se/snd_em10.phd
6177,sound/se/snd_em10.bd
6178,sound/se/snd_em10.tsb
6179,sound/se/snd_em12.phd
6180,sound/se/snd_em12.bd
6181,sound/se/snd_em12.tsb
6182,sound/se/snd_em14.phd
6183,sound/se/snd_em14.bd
6184,sound/se/snd_em14.tsb
6185,sound/se/snd_em15.phd
6186,sound/se/snd_em15.bd
6187,sound/se/snd_em15.tsb
6188,sound/se/snd_em16.bd
6189,sound/se/snd_em16.phd
6190,sound/se/snd_em16.tsb
6191,sound/se/snd_em17.phd
6192,sound/se/snd_em17.bd
6193,sound/se/snd_em17.tsb
6194,sound/se/snd_em18.phd
6195,sound/se/snd_em18.bd
6196,sound/se/snd_em18.tsb
6197,sound/se/snd_em19.phd
6198,sound/se/snd_em19.bd
6199,sound/se/snd_em19.tsb
6200,sound/se/snd_em20.phd
6201,sound/se/snd_em20.bd
6202,sound/se/snd_em20.tsb
6203,sound/se/snd_em21.phd
6204,sound/se/snd_em21.bd
6205,sound/se/snd_em21.tsb
6206,sound/se/snd_em25.phd
6207,sound/se/snd_em25.bd
6208,sound/se/snd_em25.tsb
6209,sound/se/snd_em27.phd
6210,sound/se/snd_em27.bd
6211,sound/se/snd_em27.tsb
6212,sound/se/snd_em29.phd
6213,sound/se/snd_em29.bd
6214,sound/se/snd_em29.tsb
6215,sound/se/snd_em30.bd
6216,sound/se/snd_em30.phd
6217,sound/se/snd_em30.tsb
6218,sound/se/snd_em31.phd
6219,sound/se/snd_em31.bd
6220,sound/se/snd_em31.tsb
6221,sound/se/snd_em33.phd
6222,sound/se/snd_em33.bd
6223,sound/se/snd_em33.tsb
6224,sound/se/snd_em34.bd
6225,sound/se/snd_em34.phd
6226,sound/se/snd_em34.tsb
6227,sound/se/snd_em36.phd
6228,sound/se/snd_em36.bd
6229,sound/se/snd_em36.tsb
6230,sound/se/snd_em40.phd
6231,sound/se/snd_em40.bd
6232,sound/se/snd_em40.tsb
6233,sound/se/snd_em48.phd
6234,sound/se/snd_em48.bd
6235,sound/se/snd_em48.tsb
6236,sound/se/snd_em51.phd
6237,sound/se/snd_em51.bd
6238,sound/se/snd_em51.tsb
6239,sound/se/snd_em52.phd
6240,sound/se/snd_em52.bd
6241,sound/se/snd_em52.tsb
6242,sound/se/snd_em53.phd
6243,sound/se/snd_em53.bd
6244,sound/se/snd_em53.tsb
6245,sound/se/snd_em54.phd
6246,sound/se/snd_em54.bd
6247,sound/se/snd_em54.tsb
6248,sound/se/snd_em55.phd
6249,sound/se/snd_em55.bd
6250,sound/se/snd_em55.tsb
6251,sound/se/snd_em56.phd
6252,sound/se/snd_em56.bd
6253,sound/se/snd_em56.tsb
6254,sound/se/snd_em57.phd
6255,sound/se/snd_em57.bd
6256,sound/se/snd_em57.tsb
6257,sound/se/snd_em58.phd
6258,sound/se/snd_em58.bd
6259,sound/se/snd_em58.tsb
6260,sound/se/snd_em59.phd
6261,sound/se/snd_em59.bd
6262,sound/se/snd_em59.tsb
6263,sound/se/snd_em60.phd
6264,sound/se/snd_em60.bd
6265,sound/se/snd_em60.tsb
6266,sound/se/snd_em61.phd
6267,sound/se/snd_em61.bd
6268,sound/se/snd_em61.tsb
6269,sound/se/snd_em62.phd
6270,sound/se/snd_em62.bd
6271,sound/se/snd_em62.tsb
6272,sound/se/snd_em63.phd
6273,sound/se/snd_em63.bd
6274,sound/se/snd_em63.tsb
6275,sound/se/snd_em64.phd
6276,sound/se/snd_em64.bd
6277,sound/se/snd_em64.tsb
6278,sound/se/snd_em66.phd
6279,sound/se/snd_em66.bd
6280,sound/se/snd_em66.tsb
6281,sound/se/snd_em68.phd
6282,sound/se/snd_em68.bd
6283,sound/se/snd_em68.tsb
6284,sound/se/snd_em69.phd
6285,sound/se/snd_em69.bd
6286,sound/se/snd_em69.tsb
6287,sound/se/snd_em70.phd
6288,sound/se/snd_em70.bd
6289,sound/se/snd_em70.tsb
6290,sound/se/snd_em71.phd
6291,sound/se/snd_em71.bd
6292,sound/se/snd_em71.tsb
6293,sound/se/snd_em75.phd
6294,sound/se/snd_em75.bd
6295,sound/se/snd_em75.tsb
6296,sound/se/snd_em76.phd
6297,sound/se/snd_em76.bd
6298,sound/se/snd_em76.tsb
6299,sound/se/snd_em79.bd
6300,sound/se/snd_em79.phd
6301,sound/se/snd_em79.tsb
6302,sound/se/snd_em80.bd
6303,sound/se/snd_em80.phd
6304,sound/se/snd_em80.tsb
6305,sound/se/snd_em81.bd
6306,sound/se/snd_em81.phd
6307,sound/se/snd_em81.tsb
6308,sound/se/snd_em82.bd
6309,sound/se/snd_em82.phd
6310,sound/se/snd_em82.tsb
6311,sound/se/snd_em83.bd
6312,sound/se/snd_em83.phd
6313,sound/se/snd_em83.tsb
6314,sound/se/snd_em84.bd
6315,sound/se/snd_em84.phd
6316,sound/se/snd_em84.tsb
6317,sound/se/snd_em88.bd
6318,sound/se/snd_em88.phd
6319,sound/se/snd_em88.tsb
6320,emmodel/em32/em32.pmo
6321,emmodel/em32/em32.ahi
6322,emmodel/em32/em32.tmh
6323,motion/em04_tbl.bin
6324,motion/em10_tbl.bin
6325,sound/stream/resides/EF_YAKII.at3
6326,sound/stream/resides/EF_NIKU2.at3
6327,sound/stream/resides/EF_Gouse.at3
6328,sound/stream/resides/EF_BUTA0.at3
6329,sound/stream/resides/EF_BUTA1.at3
6330,sound/stream/others/M0_MURA1.at3
6331,sound/stream/others/M0_MURA2.at3
6332,sound/stream/resides/EF_ED_CR.at3
6333,sound/stream/resides/EF_ED_FL.at3
6334,sound/stream/resides/EF_ED_RT.at3
6335,sound/stream/resides/EF_NIKUs.at3
6336,sound/stream/resides/EF_NIKU0.at3
6337,sound/stream/resides/EF_NIKU1.at3
6338,sound/stream/resides/EF_GET00.at3
6339,sound/stream/resides/EF_GET01.at3
6340,sound/stream/resides/EF_GET02.at3
6341,sound/stream/resides/EF_GET03.at3
6342,sound/stream/resides/EF_MIS00.at3
6343,sound/stream/resides/S_CLEAR1.at3
6344,sound/stream/resides/S_DEATH1.at3
6345,sound/stream/resides/S_G_OVER.at3
6346,sound/stream/resides/S_FOUND1.at3
6347,sound/stream/resides/EF_RANK1.at3
6348,sound/stream/others/EF_BLANK.at3
6349,sound/stream/others/EFDEMO03.at3
6350,sound/stream/others/EFDEMO04.at3
6351,sound/stream/others/EFDEMO05.at3
6352,sound/stream/others/EFDEMO06.at3
6353,sound/stream/others/EFDEMO10.at3
6354,sound/stream/others/EFDEMO11.at3
6355,sound/stream/others/EFDEMO14.at3
6356,sound/stream/others/EFDEMO17.at3
6357,sound/stream/others/EFDEMO20.at3
6358,sound/stream/others/EFDEMO24.at3
6359,sound/stream/others/EFDEMO25.at3
6360,sound/stream/others/EFDEMO26.at3
6361,sound/stream/others/EFDEMO27.at3
6362,sound/stream/others/EFDEMO28.at3
6363,sound/stream/others/EFDEMO36.at3
6364,sound/stream/others/EFDEMO44.at3
6365,sound/stream/others/EFDEMO45.at3
6366,sound/stream/others/EF_YAK_2.at3
6367,sound/stream/others/EFDEMO15.at3
6368,sound/stream/others/EFDEMO16.at3
6369,sound/stream/others/EFDEMO30.at3
6370,sound/stream/others/EFDEMO31.at3
6371,sound/stream/others/EFDEMO31N.at3
6372,sound/stream/others/EFDEMO32.at3
6373,sound/stream/others/EFDEMO33.at3
6374,sound/stream/others/EFDEMO34.at3
6375,sound/stream/others/EFDEMO34N.at3
6376,sound/stream/others/EFDEMO35.at3
6377,sound/stream/others/EFDEMO35N.at3
6378,sound/stream/others/EFDEMO37.at3
6379,sound/stream/others/EFDEMO38.at3
6380,sound/stream/others/EFDEMO39.at3
6381,sound/stream/others/EFDEMO40.at3
6382,sound/stream/others/EFDEMO41.at3
6383,sound/stream/others/EFDEMO42.at3
6384,sound/stream/others/EFDEMO43.at3
6385,sound/stream/others/EFDEMO46.at3
6386,sound/stream/others/EFDEMO46N.at3
6387,sound/stream/others/EFDEMO47S.at3
6388,sound/stream/others/EFDEMO47.at3
6389,sound/stream/others/EFDEMO48.at3
6390,sound/stream/others/EFDEMO49.at3
6391,sound/stream/others/EFDEMO50.at3
6392,sound/stream/others/EFDEMO51.at3
6393,sound/stream/others/EFDEMO51N.at3
6394,sound/stream/others/EFDEMO56.at3
6395,sound/stream/others/EFDEMO57.at3
6396,sound/stream/others/EFDEMO59.at3
6397,sound/stream/others/EFDEMO60.at3
6398,sound/stream/others/EFDEMO61.at3
6399,sound/stream/others/EFDEMO62.at3
6400,sound/stream/others/EFDEMO63.at3
6401,sound/stream/others/EFDEMO64.at3
6402,sound/stream/others/EFDEMO65.at3
6403,sound/stream/others/EFDEMO66.at3
6404,sound/stream/others/EFDEMO67.at3
6405,sound/stream/others/EFDEMO68.at3
6406,sound/stream/others/EFDEMO69.at3
6407,sound/stream/others/EFDEMO70.at3
6408,sound/stream/others/EFDEMO71.at3
6409,sound/stream/others/EFDEMO72.at3
6410,sound/stream/others/M1_BUKI1.at3
6411,sound/stream/others/M3_ST55a.at3
6412,sound/stream/others/MC_NKAZE.at3
6413,sound/stream/others/MG_HANKA.at3
6414,sound/stream/others/MJ_CP110.at3
6415,sound/stream/others/MJ_DK117.at3
6416,sound/stream/others/MJ_DK118.at3
6417,sound/stream/others/MJ_DN119.at3
6418,sound/stream/others/MJ_GK111.at3
6419,sound/stream/others/MJ_JG112.at3
6420,sound/stream/others/MJ_JG116.at3
6421,sound/stream/others/MJ_RAIN1.at3
6422,sound/stream/others/MJ_RAIN2.at3
6423,sound/stream/others/MJ_RAIN3.at3
6424,sound/stream/others/MJ_SH_R1.at3
6425,sound/stream/others/MJ_SH_R2.at3
6426,sound/stream/others/MJ_SH_R3.at3
6427,sound/stream/others/MJ_SH113.at3
6428,sound/stream/others/MK_CP161.at3
6429,sound/stream/others/MK_DK_NT.at3
6430,sound/stream/others/MK_DK162.at3
6431,sound/stream/others/MK_IWABA.at3
6432,sound/stream/others/MK_KAKOU.at3
6433,sound/stream/others/MK_YOUGA.at3
6434,sound/stream/others/MM_CP021.at3
6435,sound/stream/others/MM_GK032.at3
6436,sound/stream/others/MM_KAZE1.at3
6437,sound/stream/others/MM_MR034.at3
6438,sound/stream/others/MM_MR035.at3
6439,sound/stream/others/MM_MR042.at3
6440,sound/stream/others/MM_NKAZE.at3
6441,sound/stream/others/MM_NMORI.at3
6442,sound/stream/others/MM_ST039.at3
6443,sound/stream/others/MM_ST040.at3
6444,sound/stream/others/MM_ST041.at3
6445,sound/stream/others/MM_ST043.at3
6446,sound/stream/others/MM_ST187.at3
6447,sound/stream/others/MM_ST192.at3
6448,sound/stream/others/MM_ST194.at3
6449,sound/stream/others/MM_ST195.at3
6450,sound/stream/others/MM_ST196.at3
6451,sound/stream/others/MN_DOUKU.at3
6452,sound/stream/others/MN_NUMA1.at3
6453,sound/stream/others/MN_RAIN1.at3
6454,sound/stream/others/MN_RAIN2.at3
6455,sound/stream/others/MN_ST156.at3
6456,sound/stream/others/MN_ST70L.at3
6457,sound/stream/others/MN_ST70M.at3
6458,sound/stream/others/MN_ST70N.at3
6459,sound/stream/others/MN_YORU1.at3
6460,sound/stream/others/MN_YORU2.at3
6461,sound/stream/others/MN_YORU3.at3
6462,sound/stream/others/MR_RAIN1.at3
6463,sound/stream/others/MR_RAIN2.at3
6464,sound/stream/others/MR_RAIN3.at3
6465,sound/stream/others/MS_DK147.at3
6466,sound/stream/others/MS_IWABA.at3
6467,sound/stream/others/MS_NKAZE.at3
6468,sound/stream/others/MS_OASYS.at3
6469,sound/stream/others/MS_SD_N2.at3
6470,sound/stream/others/MS_SD_NT.at3
6471,sound/stream/others/MS_SD141.at3
6472,sound/stream/others/MS_TITEI.at3
6473,sound/stream/others/MT_CP121.at3
6474,sound/stream/others/MT_INTWR.at3
6475,sound/stream/others/MT_KAZE1.at3
6476,sound/stream/others/MT_ST122.at3
6477,sound/stream/others/MT_ST130.at3
6478,sound/stream/others/MT_TP124.at3
6479,sound/stream/others/MY_CP098.at3
6480,sound/stream/others/MY_DK093.at3
6481,sound/stream/others/MY_DK094.at3
6482,sound/stream/others/MY_GK095.at3
6483,sound/stream/others/MY_KAZE0.at3
6484,sound/stream/others/MY_KAZE1.at3
6485,sound/stream/others/MY_KAZE2.at3
6486,sound/stream/others/MY_NT108.at3
6487,sound/stream/others/MY_ST099.at3
6488,sound/stream/others/SV_DOUKU.at3
6489,sound/stream/others/M3_CAMP1.at3
6490,sound/stream/others/M3_KAZE0.at3
6491,sound/stream/others/M3_KAZE1.at3
6492,sound/stream/others/M3_ST54a.at3
6493,sound/stream/others/M3_heya0.at3
6494,sound/stream/others/M4_CAMP1.at3
6495,sound/stream/others/M4_DOUKU.at3
6496,sound/stream/others/M4_KAZE1.at3
6497,sound/stream/others/M4_MORI1.at3
6498,sound/stream/others/M4_MORI2.at3
6499,sound/stream/others/M4_NUMA1.at3
6500,sound/stream/others/M5_CAMP1.at3
6501,sound/stream/others/M5_DOUKU.at3
6502,sound/stream/others/M5_IWABA.at3
6503,sound/stream/others/M5_ST62a.at3
6504,sound/stream/others/M5_YOUGA.at3
6505,sound/stream/others/M6_CAMP1.at3
6506,sound/stream/others/M6_DOUKU.at3
6507,sound/stream/others/M6_MORI1.at3
6508,sound/stream/others/M6_MORI2.at3
6509,sound/stream/others/M6_ST05a.at3
6510,sound/stream/others/M6_ST19a.at3
6511,sound/stream/others/M6_TAKI1.at3
6512,sound/stream/others/MH_CAMPD.at3
6513,sound/stream/others/MH_CAMPN.at3
6514,sound/stream/others/MH_DOUKD.at3
6515,sound/stream/others/MH_DOUKN.at3
6516,sound/stream/others/MH_GNTTD.at3
6517,sound/stream/others/MH_GNTTN.at3
6518,sound/stream/others/MH_KAWAD.at3
6519,sound/stream/others/MH_KAWAN.at3
6520,sound/stream/others/MH_KKS_D.at3
6521,sound/stream/others/MH_KKS_N.at3
6522,sound/stream/others/MH_MAP_D.at3
6523,sound/stream/others/MH_MAP_N.at3
6524,sound/stream/others/MH_SHU_D.at3
6525,sound/stream/others/MH_SHU_N.at3
6526,sound/stream/others/MH_YAMAD.at3
6527,sound/stream/others/MH_YAMAN.at3
6528,sound/stream/others/MA_MAP_D.at3
6529,sound/stream/others/MA_MAP_N.at3
6530,sound/stream/others/MG_MAP_D.at3
6531,sound/stream/others/MG_MAP_N.at3
6532,sound/stream/others/MJ_MAP_D.at3
6533,sound/stream/others/MJ_MAP_N.at3
6534,sound/stream/others/MK_MAP_D.at3
6535,sound/stream/others/MK_MAP_N.at3
6536,sound/stream/others/MM_MAP_D.at3
6537,sound/stream/others/MM_MAP_N.at3
6538,sound/stream/others/MN_MAP_D.at3
6539,sound/stream/others/MN_MAP_N.at3
6540,sound/stream/others/MS_MAP_D.at3
6541,sound/stream/others/MS_MAP_N.at3
6542,sound/stream/others/MT_MAP_D.at3
6543,sound/stream/others/MY_MAP_D.at3
6544,sound/stream/others/MY_MAP_N.at3
6545,sound/stream/others/S_M3CAMP.at3
6546,sound/stream/others/S_M4CAMP.at3
6547,sound/stream/others/S_M5CAMP.at3
6548,sound/stream/others/S_M6CAMP.at3
6549,sound/stream/others/S_CHARAS.at3
6550,sound/stream/others/S_FIGHT1.at3
6551,sound/stream/others/S_FIGHT2.at3
6552,sound/stream/others/S_FIGHT3.at3
6553,sound/stream/others/S_FIGHT4.at3
6554,sound/stream/others/S_FIGHT5.at3
6555,sound/stream/others/S_FIGHT6.at3
6556,sound/stream/others/S_FIGHT7.at3
6557,sound/stream/others/S_FIGHTA.at3
6558,sound/stream/others/S_FIGHTB.at3
6559,sound/stream/others/S_FIGHTC.at3
6560,sound/stream/others/S_FIGHTN.at3
6561,sound/stream/others/SF_A_LEX.at3
6562,sound/stream/others/SF_FIGH1.at3
6563,sound/stream/others/SF_FIGH2.at3
6564,sound/stream/others/SF_FIRED.at3
6565,sound/stream/others/SF_GOLDG.at3
6566,sound/stream/others/SF_GOLIO.at3
6567,sound/stream/others/SF_METD_.at3
6568,sound/stream/others/SF_NEKOF.at3
6569,sound/stream/others/SF_STELS.at3
6570,sound/stream/others/SF_T_LEX.at3
6571,sound/stream/others/SF_T_OUT.at3
6572,sound/stream/others/SF_T_TOP.at3
6573,sound/stream/others/SF_TGASS.at3
6574,sound/stream/others/SF_THEAD.at3
6575,sound/stream/others/SF_THEME.at3
6576,sound/stream/others/SF_YANGR.at3
6577,sound/stream/others/P1FIGHT3.at3
6578,sound/stream/others/P1FIGHT4.at3
6579,sound/stream/others/P1FIGHT5.at3
6580,sound/stream/others/P1FIGHT6.at3
6581,sound/stream/others/S_MHF00D.at3
6582,sound/stream/others/SF_A2REX.at3
6583,sound/stream/others/SF_T2REX.at3
6584,sound/stream/others/SF_FIGH3.at3
6585,sound/stream/others/SV_AINTR.at3
6586,sound/stream/others/SV_NYAON.at3
6587,sound/stream/others/SD_TOUJO.at3
6588,sound/stream/others/SD_TOJO2.at3
6589,sound/stream/others/SD_KAIKO.at3
6590,sound/stream/others/SV_SEIKO.at3
6591,sound/stream/others/SV_KITCN.at3
6592,sound/stream/others/SV_SKILL.at3
6593,sound/stream/others/SV_CHANG.at3
6594,sound/stream/others/SV_SHYUK.at3
6595,sound/stream/others/SV_EVENT.at3
6596,sound/stream/others/S_STDEMO.at3
6597,sound/stream/others/EF_PSPRN.at3
6598,sound/stream/others/SN_LBY_0.at3
6599,sound/stream/others/S_INFLASM.at3
6600,sound/stream/others/SD_KAINO.at3
6601,sound/stream/others/SD_KAIYS.at3
`;var ks=`// Headgear
str HeadArmorID[437] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Leather Helm",
  "Chain Helm",
  "Hunter's Helm",
  "Hunter's Cap",
  "Bone Helm",
  "Bone Cap",
  "Velociprey Helm",
  "Velociprey Cap",
  "Battle Helm",
  "Battle Cap",
  "Vespoid Helm",
  "Vespoid Cap",
  "Hornet Helm",
  "Hornet Cap",
  "Hi-Metal Helm",
  "Hi-Metal Cap",
  "Genprey Helm",
  "Genprey Cap",
  "Ioprey Helm",
  "Ioprey Cap",
  "Gypceros Helm",
  "Gypceros Cap",
  "Cephalos Helm",
  "Cephalos Cap",
  "Rathian Helm",
  "Rathian Cap",
  "Khezu Helm",
  "Khezu Cap",
  "Rathalos Helm",
  "Rathalos Cap",
  "Plesioth Helm",
  "Plesioth Cap",
  "Lobster Helm",
  "Basarios Helm",
  "Basarios Cap",
  "Diablo Helm",
  "Diablo Cap",
  "Monoblos Helm",
  "Monoblos Cap",
  "Gravios Helm",
  "Gravios Cap",
  "Black Belt Helm",
  "Mosswine Mask",
  "Felyne Mask",
  "Chaoshroom",
  "Melahoa Flower Hat",
  "Makluva Hood",
  "Bistro Cap",
  "Velociprey Mask",
  "Genprey Mask",
  "Ioprey Mask",
  "Bullfango Mask",
  "Red Piercing",
  "Blue Piercing",
  "Yellow Piercing",
  "Black Piercing",
  "Shinobi Mask (Sun)",
  "Shinobi Mask (Moon)",
  "Guardian Helm",
  "Guardian Mask",
  "Helper Hood",
  "Healer Glasses",
  "Skull Face",
  "Yian Garuga Helm",
  "Yian Garuga Cap",
  "Garuga Mask",
  "Auroros Helm",
  "Genesis Headpiece",
  "Borealis Crown",
  "Glyph Crown",
  "Black Head",
  "Black Face",
  "Leather Helm U",
  "Chain Helm U",
  "Hunter's Helm U",
  "Hunter's Cap U",
  "Bone Helm U",
  "Bone Cap U",
  "Giaprey Helm U",
  "Giaprey Cap U",
  "Battle Helm U",
  "Battle Cap U",
  "Vespoid Helm U",
  "Vespoid Cap U",
  "Hornet Helm U",
  "Hornet Cap U",
  "Hi-Metal Helm U",
  "Hi-Metal Cap U",
  "Genprey Helm U",
  "Genprey Cap U",
  "Ioprey Helm U",
  "Ioprey Cap U",
  "Gypceros Helm U",
  "Gypceros Cap U",
  "Cephalos Helm U",
  "Cephalos Cap U",
  "Rathian Heart Helm",
  "Rathian Heart Cap",
  "Khezu Helm U",
  "Khezu Cap U",
  "Rathalos Soul Helm",
  "Rathalos Soul Cap",
  "Plesioth Helm U",
  "Plesioth Cap U",
  "Basarios Helm U",
  "Basarios Cap U",
  "Diablo Helm U",
  "Diablo Cap U",
  "Monodevil Helm",
  "Monodevil Cap",
  "Gravios Helm U",
  "Gravios Cap U",
  "Shinobi Mask (Sky)",
  "Shinobi Mask (Sea)",
  "Guardian Helm U",
  "Guardian Mask U",
  "Helper Hood U",
  "Healer Beret U",
  "Auroros Helm Ten",
  "Genesis HeadpieceTen",
  "Borealis Crown Ten",
  "Glyph Crown Ten",
  "Fatalis Head",
  "Fatalis Face",
  "Golden Moon Helm",
  "Golden Moon Cap",
  "Silver Sol Helm",
  "Silver Sol Cap",
  "Leather Helm S",
  "Chain Helm S",
  "Hunter's Helm S",
  "Hunter's Cap S",
  "Bone Helm S",
  "Bone Cap S",
  "Velociprey Helm S",
  "Velociprey Cap S",
  "Battle Helm S",
  "Battle Cap S",
  "Vespoid Helm S",
  "Vespoid Cap S",
  "Hornet Helm S",
  "Hornet Cap S",
  "Hi-Metal Helm S",
  "Hi-Metal Cap S",
  "Genprey Helm S",
  "Genprey Cap S",
  "Kut-Ku Helm S",
  "Kut-Ku Cap S",
  "Ioprey Helm S",
  "Ioprey Cap S",
  "Gypceros Helm S",
  "Gypceros Cap S",
  "Cephalos Helm S",
  "Cephalos Cap S",
  "Rathian Helm S",
  "Rathian Cap S",
  "Khezu Helm S",
  "Khezu Cap S",
  "Rathalos Helm S",
  "Rathalos Cap S",
  "Plesioth Helm S",
  "Plesioth Cap S",
  "Basarios Helm S",
  "Basarios Cap S",
  "Diablo Helm S",
  "Diablo Cap S",
  "Monoblos Helm S",
  "Monoblos Cap S",
  "Gravios Helm S",
  "Gravios Cap S",
  "Shinobi Mask(Heaven)",
  "Shinobi Mask (Earth)",
  "RdGuildGuardTricorne",
  "Red Guild Guard Mask",
  "Red Guild Guard Hat",
  "RedGuildGuardPiercng",
  "Auroros Helm Haku",
  "GenesisHeadpieceHaku",
  "Borealis Crown Haku",
  "Glyph Crown Haku",
  "Dragonhead S",
  "Dragonface S",
  "Hermitaur Helm",
  "Hermitaur Cap",
  "Hermitaur Helm U",
  "Hermitaur Cap U",
  "Hermitaur Helm S",
  "Hermitaur Cap S",
  "Conga Helm",
  "Conga Cap",
  "Conga Helm U",
  "Conga Cap U",
  "Conga Helm S",
  "Conga Cap S",
  "Blango Helm",
  "Blango Cap",
  "Blango Helm U",
  "Blango Cap U",
  "Blango Helm S",
  "Blango Cap S",
  "Ceanataur Helm",
  "Ceanataur Cap",
  "Ceanataur Helm U",
  "Ceanataur Cap U",
  "Ceanataur Helm S",
  "Ceanataur Cap S",
  "Kirin Horn",
  "Kirin Crest",
  "Kirin Horn S",
  "Kirin Crest S",
  "Kushala Glare",
  "Kushala Snarl",
  "Mizuha Cap",
  "Extravagant Cap",
  "Empress Crown",
  "Empress Mask",
  "Indra Helm",
  "Steadfast Helm",
  "Kaiser Crown",
  "Kaiser Mask",
  "Guardian Spirit Mask",
  "Carnage Mask",
  "Golden Hair Tie",
  "Puppet Master Mask",
  "White Fatalis Head",
  "White Fatalis Face",
  "Black Belt Helm S",
  "Giaprey Mask",
  "Remobra Face",
  "Guild Knight Feather",
  "Guild Knight Mask",
  "Maiden's Hat",
  "Designer Glasses",
  "White Piercing",
  "BlGuildGuardTricorne",
  "Blue GuildGuard Mask",
  "Blue Guild Guard Hat",
  "BluGuildGuardPiercng",
  "Lobster Cap",
  "Silence Piercing",
  "Piercing of Rage",
  "Demon Edge Piercing",
  "Blast Piercing",
  "Piercing of Mastery",
  "Piercing of Pursuit",
  "Kirin Piercing",
  "Piercing of Might",
  "Piercing of Fate",
  "Echo Piercing",
  "Amezari Head",
  "Amezari Cap",
  "Mafumofu Hood",
  "Mafumofu Hood S",
  "Giaprey Helm",
  "Giaprey Cap",
  "Melahoa Bloom",
  "Melahoa Flower Hat U",
  "Melahoa Bloom U",
  "Makluva Gills",
  "Makluva Hood U",
  "Makluva Gills U",
  "Bistro Cap U",
  "Kut-Ku Helm",
  "Kut-Ku Cap",
  "Kut-Ku Helm D",
  "Kut-Ku Cap D",
  "Kut-Ku Helm U",
  "Kut-Ku Cap U",
  "Gypceros Helm D",
  "Gypceros Cap D",
  "Plesioth Helm D",
  "Plesioth Cap D",
  "Khezu Helm D",
  "Khezu Cap D",
  "Obituary Testa",
  "Obituary Caput",
  "Butterfly Testa",
  "Butterfly Caput",
  "Obituary Testa S",
  "Obituary Caput S",
  "Butterfly Testa S",
  "Butterfly Caput S",
  "Kushala Glare S",
  "Kushala Snarl S",
  "Tigrex Helm",
  "Tigrex Cap",
  "Tigrex Helm S",
  "Tigrex Cap S",
  "Death Stench Brain",
  "Death Stench Soul",
  "Death Stench Brain S",
  "Death Stench Soul S",
  "Diablo Helm D",
  "Diablo Cap D",
  "Gravios Helm D",
  "Gravios Cap D",
  "Supreme Mizuha Cap",
  "SuprmeExtravagantCap",
  "Kaiser Crown S",
  "Kaiser Mask S",
  "Rathian Heart Helm U",
  "Rathian Heart Cap U",
  "Rathalos Soul Helm U",
  "Rathalos Soul Cap U",
  "Ultimate Indra Helm",
  "SupremeSteadfastHelm",
  "Dark Akantor Mask",
  "Dark Akantor Fangs",
  "Sword Saint Piercing",
  "Barrage Piercing",
  "Protection Piercing",
  "Diasorte Helm",
  "Diasorte Cap",
  "Pirate J Hat",
  "Pirate J Roger",
  "Hypno Helm X",
  "Hypno Cap X",
  "Lava Helm X",
  "Lava Cap X",
  "Garuga Helm X",
  "Garuga Cap X",
  "Kut-Ku Helm Z",
  "Kut-Ku Cap Z",
  "Gypceros Helm Z",
  "Gypceros Cap Z",
  "Khezu Helm Z",
  "Khezu Cap Z",
  "Basarios Helm X",
  "Basarios Cap X",
  "Plesioth Helm Z",
  "Plesioth Cap Z",
  "Hermitaur Helm Z",
  "Hermitaur Cap Z",
  "Conga Helm Z",
  "Conga Cap Z",
  "Rathian Heart Helm Z",
  "Rathian Heart Cap Z",
  "Rathalos Soul Helm Z",
  "Rathalos Soul Cap Z",
  "Ceanataur Helm Z",
  "Ceanataur Cap Z",
  "Blango Helm Z",
  "Blango Cap Z",
  "Auroros Helm Goku",
  "GenesisHeadpieceGoku",
  "Borealis Crown Goku",
  "Glyph Crown Goku",
  "Golden Moon Helm Z",
  "Golden Moon Cap Z",
  "Silver Sol Helm Z",
  "Silver Sol Cap Z",
  "Diablo Helm Z",
  "Diablo Cap Z",
  "Gravios Helm Z",
  "Gravios Cap Z",
  "Tigrex Helm X",
  "Tigrex Cap X",
  "Indra Helm Shin",
  "Steadfast Helm Shin",
  "Golden Hair Tie Shin",
  "PuppetMasterMaskShin",
  "Kirin Horn X",
  "Kirin Crest X",
  "Kushala Glare X",
  "Kushala Snarl X",
  "Mizuha Cap Shin",
  "Extravagant Cap Shin",
  "Kaiser Crown X",
  "Kaiser Mask X",
  "GuardianSprtMaskShin",
  "Carnage Mask Shin",
  "Fatalis Head Z",
  "Fatalis Face Z",
  "White Fatalis Head Z",
  "White Fatalis Face Z",
  "Black Belt Helm X",
  "Black Belt Cap X",
  "Melahoa Flower Hat Z",
  "Melahoa Bloom Z",
  "Makluva Hood Z",
  "Makluva Gills Z",
  "Chakra Piercing",
  "Hypno Helm S",
  "Hypno Cap S",
  "Garuga Helm S",
  "Garuga Cap S",
  "Narga Helm S",
  "Narga Cap S",
  "Monodevil Helm U",
  "Monodevil Cap U",
  "Kut-Ku Helm X",
  "Kut-Ku Cap X",
  "Conga Helm X",
  "Conga Cap X",
  "Gypceros Helm X",
  "Gypceros Cap X",
  "Khezu Helm X",
  "Khezu Cap X",
  "Hermitaur Helm X",
  "Hermitaur Cap X",
  "Plesioth Helm X",
  "Plesioth Cap X",
  "Obituary Testa X",
  "Obituary Caput X",
  "Butterfly Testa X",
  "Butterfly Caput X",
  "Blango Helm X",
  "Blango Cap X",
  "Monoblos Helm X",
  "Monoblos Cap X",
  "Ceanataur Helm X",
  "Ceanataur Cap X",
  "Rathian Helm X",
  "Rathian Cap X",
  "Rathalos Helm X",
  "Rathalos Cap X",
  "Narga Helm X",
  "Narga Cap X",
  "Diablo Helm X",
  "Diablo Cap X",
  "Gravios Helm X",
  "Gravios Cap X",
  "Empress Crown X",
  "Empress Mask X",
  "Dragonhead X",
  "Dragonface X",
  "Dark Ukanlos Mask",
  "Dark Ukanlos Fangs",
  "Hypno Helm",
  "Hypno Cap",
  "Lava Helm",
  "Lava Cap",
  "Ambitious Piercing",
  "Comrade Piercing",
  "Hawkeye Piercing"
};

// Body
str ChestArmorID[435] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Leather Armor",
  "Chain Mail",
  "Hunter's Mail",
  "Hunter's Vest",
  "Bone Mail",
  "Bone Vest",
  "Velociprey Mail",
  "Velociprey Vest",
  "Battle Mail",
  "Battle Vest",
  "Vespoid Mail",
  "Vespoid Vest",
  "Hornet Mail",
  "Hornet Vest",
  "Hi-Metal Mail",
  "Hi-Metal Vest",
  "Genprey Mail",
  "Genprey Vest",
  "Kut-Ku Mail",
  "Kut-Ku Vest",
  "Ioprey Mail",
  "Ioprey Vest",
  "Gypceros Mail",
  "Gypceros Vest",
  "Cephalos Mail",
  "Cephalos Vest",
  "Steel Mail",
  "Rathian Mail",
  "Rathian Vest",
  "Khezu Mail",
  "Khezu Vest",
  "Rathalos Mail",
  "Rathalos Vest",
  "Plesioth Mail",
  "Plesioth Vest",
  "Lobster Mail",
  "Lobster Vest",
  "Basarios Mail",
  "Basarios Vest",
  "Diablo Mail",
  "Diablo Vest",
  "Monoblos Mail",
  "Monoblos Vest",
  "Gravios Mail",
  "Gravios Vest",
  "Black Belt Mail",
  "Moss Breastplate",
  "MelahoaFlowerJacket",
  "Makluva Cover",
  "Bistro Jacket",
  "Velociprey Body",
  "Genprey Body",
  "Ioprey Body",
  "Shinobi Suit (Sun)",
  "Shinobi Suit (Moon)",
  "Guardian Suit",
  "Guardian Vest",
  "Helper Vest",
  "Healer Vest",
  "Yian Garuga Mail",
  "Yian Garuga Vest",
  "Auroros Torso",
  "Genesis Torso",
  "Borealis Chest",
  "Glyph Chest",
  "Black Hide",
  "Black Skin",
  "Leather Armor U",
  "Chain Mail U",
  "Hunter's Mail U",
  "Hunter's Vest U",
  "Bone Mail U",
  "Bone Vest U",
  "Giaprey Mail U",
  "Giaprey Vest U",
  "Battle Mail U",
  "Battle Vest U",
  "Vespoid Mail U",
  "Vespoid Vest U",
  "Hornet Mail U",
  "Hornet Vest U",
  "Hi-Metal Mail U",
  "Hi-Metal Vest U",
  "Genprey Mail U",
  "Genprey Vest U",
  "Kut-Ku Mail U",
  "Kut-Ku Vest U",
  "Ioprey Mail U",
  "Ioprey Vest U",
  "Gypceros Mail U",
  "Gypceros Vest U",
  "Cephalos Mail U",
  "Cephalos Vest U",
  "Steel Mail U",
  "Rathian Heart Mail",
  "Rathian Heart Vest",
  "Khezu Mail U",
  "Khezu Vest U",
  "Rathalos Soul Mail",
  "Rathalos Soul Vest",
  "Plesioth Mail U",
  "Plesioth Vest U",
  "Basarios Mail U",
  "Basarios Vest U",
  "Diablo Mail U",
  "Diablo Vest U",
  "Monodevil Mail",
  "Monodevil Vest",
  "Gravios Mail U",
  "Gravios Vest U",
  "Shinobi Suit (Sky)",
  "Shinobi Suit (Sea)",
  "Guardian Suit U",
  "Guardian Vest U",
  "Helper Vest U",
  "Healer Vest U",
  "Auroros Torso Ten",
  "Genesis Torso Ten",
  "Borealis Chest Ten",
  "Glyph Chest Ten",
  "Fatalis Hide",
  "Fatalis Skin",
  "Golden Moon Mail",
  "Golden Moon Vest",
  "Silver Sol Mail",
  "Silver Sol Vest",
  "Leather Armor S",
  "Chain Mail S",
  "Hunter's Mail S",
  "Hunter's Vest S",
  "Bone Mail S",
  "Bone Vest S",
  "Velociprey Mail S",
  "Velociprey Vest S",
  "Battle Mail S",
  "Battle Vest S",
  "Vespoid Mail S",
  "Vespoid Vest S",
  "Hornet Mail S",
  "Hornet Vest S",
  "Hi-Metal Mail S",
  "Hi-Metal Vest S",
  "Genprey Mail S",
  "Genprey Vest S",
  "Kut-Ku Mail S",
  "Kut-Ku Vest S",
  "Ioprey Mail S",
  "Ioprey Vest S",
  "Gypceros Mail S",
  "Gypceros Vest S",
  "Cephalos Mail S",
  "Cephalos Vest S",
  "Steel Mail S",
  "Rathian Mail S",
  "Rathian Vest S",
  "Khezu Mail S",
  "Khezu Vest S",
  "Rathalos Mail S",
  "Rathalos Vest S",
  "Plesioth Mail S",
  "Plesioth Vest S",
  "Basarios Mail S",
  "Basarios Vest S",
  "Diablo Mail S",
  "Diablo Vest S",
  "Monoblos Mail S",
  "Monoblos Vest S",
  "Gravios Mail S",
  "Gravios Vest S",
  "Shinobi Suit(Heaven)",
  "Shinobi Suit (Earth)",
  "Red Guild Guard Suit",
  "Red Guild Guard Vest",
  "Red Guild Guard Suit",
  "Red Guild Guard Vest",
  "Auroros Torso Haku",
  "Genesis Torso Haku",
  "Borealis Chest Haku",
  "Glyph Chest Haku",
  "Dragonhide S",
  "Dragonskin S",
  "Hermitaur Mail",
  "Hermitaur Vest",
  "Hermitaur Mail U",
  "Hermitaur Vest U",
  "Hermitaur Mail S",
  "Hermitaur Vest S",
  "Conga Mail ",
  "Conga Vest",
  "Conga Mail U",
  "Conga Vest U",
  "Conga Mail S",
  "Conga Vest S",
  "Blango Mail",
  "Blango Vest",
  "Blango Mail U",
  "Blango Vest U",
  "Blango Mail S",
  "Blango Vest S",
  "Ceanataur Mail",
  "Ceanataur Vest",
  "Ceanataur Mail U",
  "Ceanataur Vest U",
  "Ceanataur Mail S",
  "Ceanataur Vest S",
  "Kirin Jacket",
  "Kirin Cape",
  "Kirin Jacket S",
  "Kirin Cape S",
  "Kushala Cista",
  "Kushala Vise",
  "Mizuha Guards",
  "Extravagant Camise",
  "Empress Mail",
  "Empress Vest",
  "Indra Vest",
  "Steadfast Vest",
  "Kaiser Mail",
  "Kaiser Vest",
  "GuardianSpritRaiment",
  "Carnage Raiment",
  "Golden Haori",
  "PuppetMaster Costume",
  "White Fatalis Hide",
  "White Fatalis Skin",
  "Black Belt Mail S",
  "Giaprey Body",
  "Famitsu T-Shirt S",
  "Remobra Suit",
  "Guild Knight Suit",
  "Guild Knight Vest",
  "Maiden's Vest",
  "Personal Vest",
  "Hunter T-Shirt",
  "Famitsu T-Shirt",
  "Blue GuildGuard Suit",
  "Blue GuildGuard Vest",
  "Blue GuildGuard Suit",
  "Blue GuildGuard Vest",
  "Amezari Mail",
  "Amezari Skin",
  "Mafumofu Jacket",
  "Mafumofu Jacket S",
  "Giaprey Mail",
  "Giaprey Vest",
  "Melahoa Stalk",
  "MelahoaFlowerJacketU",
  "Melahoa Stalk U",
  "Makluva Scale",
  "Makluva Cover U",
  "Makluva Scale U",
  "Bistro Jacket U",
  "Kut-Ku Mail D",
  "Kut-Ku Vest D",
  "Gypceros Mail D",
  "Gypceros Vest D",
  "Plesioth Mail D",
  "Plesioth Vest D",
  "Khezu Mail D",
  "Khezu Vest D",
  "Obituary Petto",
  "Obituary Pectus",
  "Butterfly Petto",
  "Butterfly Pectus",
  "Obituary Petto S",
  "Obituary Pectus S",
  "Butterfly Petto S",
  "Butterfly Pectus S",
  "Kushala Cista S",
  "Kushala Vise S",
  "Tigrex Mail",
  "Tigrex Vest",
  "Tigrex Mail S",
  "Tigrex Vest S",
  "Death Stench Muscle",
  "Death Stench Heart",
  "DeathStench Muscle S",
  "Death Stench Heart S",
  "Diablo Mail D",
  "Diablo Vest D",
  "Gravios Mail D",
  "Gravios Vest D",
  "SupremeMizuha Guards",
  "SprmExtrvagantCamise",
  "Kaiser Mail S",
  "Kaiser Vest S",
  "Rathian Heart Mail U",
  "Rathian Heart Vest U",
  "Rathalos Soul Mail U",
  "Rathalos Soul Vest U",
  "Ultimate Indra Vest",
  "SupremeSteadfastVest",
  "Dark Akantor Aegis",
  "Dark Akantor Plate",
  "Diasorte Mail",
  "Diasorte Vest",
  "Pirate J Suit",
  "Pirate J Jacket",
  "Hunting Soul T-Shirt",
  "Hypno Mail X",
  "Hypno Vest X",
  "Lava Mail X",
  "Lava Vest X",
  "Garuga Mail X",
  "Garuga Vest X",
  "Kut-Ku Mail Z",
  "Kut-Ku Vest Z",
  "Gypceros Mail Z",
  "Gypceros Vest Z",
  "Khezu Mail Z",
  "Khezu Vest Z",
  "Basarios Mail X",
  "Basarios Vest X",
  "Plesioth Mail Z",
  "Plesioth Vest Z",
  "Hermitaur Mail Z",
  "Hermitaur Vest Z",
  "Conga Mail Z",
  "Conga Vest Z",
  "Rathian Heart Mail Z",
  "Rathian Heart Vest Z",
  "Rathalos Soul Mail Z",
  "Rathalos Soul Vest Z",
  "Ceanataur Mail Z",
  "Ceanataur Vest Z",
  "Blango Mail Z",
  "Blango Vest Z",
  "Auroros Torso Goku",
  "Genesis Torso Goku",
  "Borealis Chest Goku",
  "Glyph Chest Goku",
  "Golden Moon Mail Z",
  "Golden Moon Vest Z",
  "Silver Sol Mail Z",
  "Silver Sol Vest Z",
  "Diablo Mail Z",
  "Diablo Vest Z",
  "Gravios Mail Z",
  "Gravios Vest Z",
  "Tigrex Mail X",
  "Tigrex Vest X",
  "Indra Vest Shin",
  "Steadfast Vest Shin",
  "Golden Haori Shin",
  "PupptMastrCostShin",
  "Kirin Jacket X",
  "Kirin Cape X",
  "Kushala Cista X",
  "Kushala Vise X",
  "Mizuha Guards Shin",
  "ExtrvagantCamiseShin",
  "Kaiser Mail X",
  "Kaiser Vest X",
  "GuardSprRaimentShin",
  "Carnage Raiment Shin",
  "Fatalis Hide Z",
  "Fatalis Skin Z",
  "White Fatalis Hide Z",
  "White Fatalis Skin Z",
  "Black Belt Mail X",
  "Black Belt Vest X",
  "MelahoaFlowerJacketZ",
  "Melahoa Stalk Z",
  "Makluva Cover Z",
  "Makluva Scale Z",
  "Chakra Necklace",
  "Hypno Mail S",
  "Hypno Vest S",
  "Garuga Mail S",
  "Garuga Vest S",
  "Narga Mail S",
  "Narga Vest S",
  "Monodevil Mail U",
  "Monodevil Vest U",
  "Kut-Ku Mail X",
  "Kut-Ku Vest X",
  "Conga Mail X",
  "Conga Vest X",
  "Gypceros Mail X",
  "Gypceros Vest X",
  "Khezu Mail X",
  "Khezu Vest X",
  "Hermitaur Mail X",
  "Hermitaur Vest X",
  "Plesioth Mail X",
  "Plesioth Vest X",
  "Obituary Petto X",
  "Obituary Pectus X",
  "Butterfly Petto X",
  "Butterfly Pectus X",
  "Blango Mail X",
  "Blango Vest X",
  "Monoblos Mail X",
  "Monoblos Vest X",
  "Ceanataur Mail X",
  "Ceanataur Vest X",
  "Rathian Mail X",
  "Rathian Vest X",
  "Rathalos Mail X",
  "Rathalos Vest X",
  "Narga Mail X",
  "Narga Vest X",
  "Diablo Mail X",
  "Diablo Vest X",
  "Gravios Mail X",
  "Gravios Vest X",
  "Empress Mail X",
  "Empress Vest X",
  "Dragonhide X",
  "Dragonskin X",
  "Dark Ukanlos Aegis",
  "Dark Ukanlos Plate",
  "HuntingSoulT-ShirtX",
  "Hunter T-Shirt X",
  "Famitsu T-Shirt X",
  "Hypno Mail",
  "Hypno Vest",
  "Lava Mail",
  "Lava Vest"
};

// Arms
str ArmArmorID[412] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Leather Vambraces",
  "Chain Vambraces",
  "Hunter's Vambraces",
  "Hunter's Guards",
  "Bone Vambraces",
  "Bone Guards",
  "Velociprey Braces",
  "Velociprey Guards",
  "Battle Vambraces",
  "Battle Guards",
  "Vespoid Vambraces",
  "Vespoid Guards",
  "Hornet Vambraces",
  "Hornet Guards",
  "Hi-Metal Vambraces",
  "Hi-Metal Guards",
  "Genprey Vambraces",
  "Genprey Guards",
  "Kut-Ku Vambraces",
  "Kut-Ku Guards",
  "Ioprey Vambraces",
  "Ioprey Guards",
  "Gypceros Vambraces",
  "Gypceros Guards",
  "Cephalos Vambraces",
  "Cephalos Guards",
  "Steel Vambraces",
  "Rathian Vambraces",
  "Rathian Guards",
  "Khezu Vambraces",
  "Khezu Guards",
  "Rathalos Vambraces",
  "Rathalos Guards",
  "Plesioth Vambraces",
  "Plesioth Guards",
  "Lobster Vambraces",
  "Lobster Guards",
  "Basarios Vambraces",
  "Basarios Guards",
  "Diablo Vambraces",
  "Diablo Guards ",
  "Monoblos Vambraces",
  "Monoblos Guards",
  "Gravios Vambraces",
  "Gravios Guards",
  "Black Belt Vambraces",
  "Mosswine Gloves",
  "Makluva Sleeves",
  "Velociprey Gloves",
  "Genprey Gloves",
  "Ioprey Gloves",
  "Shinobi Kote (Sun)",
  "Shinobi Kote (Moon)",
  "Guardian Vambraces",
  "Guardian Guards",
  "Helper Sleeves",
  "Healer Sleeves",
  "Garuga Vambraces",
  "Garuga Guards",
  "Auroros Gauntlets",
  "Genesis Gauntlets",
  "Borealis Gauntlets",
  "Glyph Gauntlets",
  "Black Claw",
  "Black Fist",
  "Leather Vambraces U",
  "Chain Vambraces U",
  "Hunter's Vambraces U",
  "Hunter's Guards U",
  "Bone Vambraces U",
  "Bone Guards U",
  "Giaprey Vambraces U",
  "Giaprey Guards U",
  "Battle Vambraces U",
  "Battle Guards U",
  "Vespoid Vambraces U",
  "Vespoid Guards U",
  "Hornet Vambraces U",
  "Hornet Guards U",
  "Hi-Metal Vambraces U",
  "Hi-Metal Guards U",
  "Genprey Vambraces U",
  "Genprey Guards U",
  "Kut-Ku Vambraces U",
  "Kut-Ku Guards U",
  "Ioprey Vambraces U",
  "Ioprey Guards U",
  "Gypceros Vambraces U",
  "Gypceros Guards U",
  "Cephalos Vambraces U",
  "Cephalos Guards U",
  "Steel Vambraces U",
  "Rathian Heart Braces",
  "Rathian Heart Guards",
  "Khezu Vambraces U",
  "Khezu Guards U",
  "Rathalos Soul Braces",
  "Rathalos Soul Guards",
  "Plesioth Vambraces U",
  "Plesioth Guards U",
  "Basarios Vambraces U",
  "Basarios Guards U",
  "Diablo Vambraces U",
  "Diablo Guards U",
  "Monodevil Vambraces",
  "Monodevil Guards",
  "Gravios Vambraces U",
  "Gravios Guards U",
  "Shinobi Kote (Sky)",
  "Shinobi Kote (Sea)",
  "Guardian Vambraces U",
  "Guardian Guards U",
  "Helper Sleeves U",
  "Healer Sleeves U",
  "Auroros Gauntlet Ten",
  "Genesis Gauntlet Ten",
  "Borealis GauntletTen",
  "Glyph Gauntlets Ten",
  "Fatalis Claw",
  "Fatalis Fist",
  "Golden Moon Braces",
  "Golden Moon Guards",
  "Silver Sol Braces",
  "Silver Sol Guards",
  "Leather Vambraces S",
  "Chain Vambraces S",
  "Hunter's Vambraces S",
  "Hunter's Guards S",
  "Bone Vambraces S",
  "Bone Guards S",
  "Velociprey Braces S",
  "Velociprey Guards S",
  "Battle Vambraces S",
  "Battle Guards S",
  "Vespoid Vambraces S",
  "Vespoid Guards S",
  "Hornet Vambraces S",
  "Hornet Guards S",
  "Hi-Metal Vambraces S",
  "Hi-Metal Guards S",
  "Genprey Vambraces S",
  "Genprey Guards S",
  "Kut-Ku Vambraces S",
  "Kut-Ku Guards S",
  "Ioprey Vambraces S",
  "Ioprey Guards S",
  "Gypceros Vambraces S",
  "Gypceros Guards S",
  "Cephalos Vambraces S",
  "Cephalos Guards S",
  "Steel Vambraces S",
  "Rathian Vambraces S",
  "Rathian Guards S",
  "Khezu Vambraces S",
  "Khezu Guards S",
  "Rathalos Vambraces S",
  "Rathalos Guards S",
  "Plesioth Vambraces S",
  "Plesioth Guards S",
  "Basarios Vambraces S",
  "Basarios Guards S",
  "Diablo Vambraces S",
  "Diablo Guards S",
  "Monoblos Vambraces S",
  "Monoblos Guards S",
  "Gravios Vambraces S",
  "Gravios Guards S",
  "Shinobi Kote(Heaven)",
  "Shinobi Kote (Earth)",
  "RedGuildGuard Gloves",
  "RedGuildGuardSleeves",
  "RedGuildGuard Gloves",
  "RedGuildGuardSleeves",
  "Auroros GauntletHaku",
  "Genesis GauntletHaku",
  "BorealisGauntletHaku",
  "Glyph Gauntlets Haku",
  "Dragonclaw S",
  "Dragonfist S",
  "Hermitaur Braces",
  "Hermitaur Guards ",
  "Hermitaur Braces U",
  "Hermitaur Guards U",
  "Hermitaur Braces S",
  "Hermitaur Guards S",
  "Conga Vambraces",
  "Conga Guards ",
  "Conga Vambraces U",
  "Conga Guards U",
  "Conga Vambraces S",
  "Conga Guards S",
  "Blango Vambraces",
  "Blango Guards",
  "Blango Vambraces U",
  "Blango Guards U",
  "Blango Vambraces S",
  "Blango Guards S",
  "Ceanataur Braces",
  "Ceanataur Guards",
  "Ceanataur Braces U",
  "Ceanataur Guards U",
  "Ceanataur Braces S",
  "Ceanataur Guards S",
  "Kirin Longarms",
  "Kirin Gloves",
  "Kirin Longarms S",
  "Kirin Gloves S",
  "Kushala Grip",
  "Kushala Embrace",
  "Mizuha Sleeves",
  "Extravagant Sleeves",
  "Empress Vambraces",
  "Empress Guards",
  "Indra Gloves",
  "Steadfast Guards",
  "Kaiser Vambraces",
  "Kaiser Guards",
  "GuardianSprtVambrces",
  "Carnage Vambraces",
  "Golden Kote",
  "PuppetMaster Gloves",
  "White Fatalis Claw",
  "White Fatalis Fist",
  "BlackBeltVambraces S",
  "Giaprey Gloves",
  "Remobra Hands",
  "Guild Knight Gloves",
  "Guild Knight Sleeves",
  "Maiden's Sleeves",
  "Personal Sleeves",
  "BlueGuildGuardGloves",
  "BluGuildGuardSleeves",
  "BlueGuildGuardGloves",
  "BluGuildGuardSleeves",
  "Amezari Vambraces",
  "Amezari Guards",
  "Mafumofu Mittens",
  "Mafumofu Mittens S",
  "Giaprey Vambraces",
  "Giaprey Guards",
  "Melahoa Branch",
  "Melahoa Petal",
  "Melahoa Branch U",
  "Melahoa Petal U",
  "Makluva Sucker",
  "Makluva Sleeves U",
  "Makluva Sucker U",
  "Kut-Ku Vambraces D",
  "Kut-Ku Guards D",
  "Gypceros Vambraces D",
  "Gypceros Guards D",
  "Plesioth Vambraces D",
  "Plesioth Guards D",
  "Khezu Vambraces D",
  "Khezu Guards D",
  "Obituary Mano",
  "Obituary Brasso",
  "Butterfly Mano",
  "Butterfly Brasso",
  "Obituary Mano S",
  "Obituary Brasso S",
  "Butterfly Mano S",
  "Butterfly Brasso S",
  "Kushala Grip S",
  "Kushala Embrace S",
  "Tigrex Vambraces",
  "Tigrex Guards",
  "Tigrex Vambraces S",
  "Tigrex Guards S",
  "Death Stench Grip",
  "Death Stench Grasp",
  "Death Stench Grip S",
  "Death Stench Grasp S",
  "Diablo Vambraces D",
  "Diablo Guards D",
  "Gravios Vambraces D",
  "Gravios Guards D",
  "SupremeMizuhaSleeves",
  "SprmExtrvgantSleeves",
  "Kaiser Vambraces S",
  "Kaiser Guards S",
  "Rthan Heart Braces U",
  "Rathian HeartGuardsU",
  "Rthlos Soul Braces U",
  "Rthlos Soul Guards U",
  "UltimateIndraGloves",
  "SuprmSteadfastGuards",
  "Dark Akantor Claw",
  "DarkAkantor Gauntlet",
  "Diasorte Vambraces",
  "Diasorte Guards",
  "Pirate J Gloves",
  "Pirate J Cuffs",
  "Hypno Vambraces X",
  "Hypno Guards X",
  "Lava Vambraces X",
  "Lava Guards X",
  "Garuga Vambraces X",
  "Garuga Guards X",
  "Kut-Ku Vambraces Z",
  "Kut-Ku Guards Z",
  "Gypceros Vambraces Z",
  "Gypceros Guards Z",
  "Khezu Vambraces Z",
  "Khezu Guards Z",
  "Basarios Vambraces X",
  "Basarios Guards X",
  "Plesioth Vambraces Z",
  "Plesioth Guards Z",
  "HermitaurVambracesZ",
  "Hermitaur Guards Z",
  "Conga Vambraces Z",
  "Conga Guards Z",
  "RathianHrtVambracesZ",
  "RathianHeartGuardsZ",
  "RathSoulVambracesZ",
  "RathalosSoulGuardsZ",
  "CeanataurVambracesZ",
  "Ceanataur Guards Z",
  "Blango Vambraces Z",
  "Blango Guards Z",
  "AurorosGauntletsGoku",
  "GenesisGauntletsGoku",
  "BorealsGauntletsGoku",
  "Glyph Gauntlets Goku",
  "GoldenMoonVambracesZ",
  "Golden Moon Guards Z",
  "SilverSolVambracesZ",
  "Silver Sol Guards Z",
  "Diablo Vambraces Z",
  "Diablo Guards Z",
  "Gravios Vambraces Z",
  "Gravios Guards Z",
  "Tigrex Vambraces X",
  "Tigrex Guards X",
  "Indra Gloves Shin",
  "SteadfastGuardsShin",
  "Golden Kote Shin",
  "PupptMastrGlovesShin",
  "Kirin Longarms X",
  "Kirin Gloves X",
  "Kushala Grip X",
  "Kushala Embrace X",
  "Mizuha Sleeves Shin",
  "ExtrvagntSleevesShin",
  "Kaiser Vambraces X",
  "Kaiser Guards X",
  "GuardSprtVmbrcesShin",
  "CarnageVambracesShin",
  "Fatalis Claw Z",
  "Fatalis Fist Z",
  "White Fatalis Claw Z",
  "White Fatalis Fist Z",
  "BlackBeltVambracesX",
  "Black Belt Guards X",
  "Melahoa Branch Z",
  "Melahoa Petal Z",
  "Makluva Sleeves Z",
  "Makluva Sucker Z",
  "Chakra Bracelet",
  "Hypno Vambraces S",
  "Hypno Guards S",
  "Garuga Vambraces S",
  "Garuga Guards S",
  "Narga Vambraces S",
  "Narga Guards S",
  "MonodevilVambracesU",
  "Monodevil Guards U",
  "Kut-Ku Vambraces X",
  "Kut-Ku Guards X",
  "Conga Vambraces X",
  "Conga Guards X",
  "Gypceros Vambraces X",
  "Gypceros Guards X",
  "Khezu Vambraces X",
  "Khezu Guards X",
  "HermitaurVambracesX",
  "Hermitaur Guards X",
  "Plesioth Vambraces X",
  "Plesioth Guards X",
  "Obituary Mano X",
  "Obituary Brasso X",
  "Butterfly Mano X",
  "Butterfly Brasso X",
  "Blango Vambraces X",
  "Blango Guards X",
  "Monoblos Vambraces X",
  "Monoblos Guards X",
  "CeanataurVambracesX",
  "Ceanataur Guards X",
  "Rathian Vambraces X",
  "Rathian Guards X",
  "Rathalos Vambraces X",
  "Rathalos Guards X",
  "Narga Vambraces X",
  "Narga Guards X",
  "Diablo Vambraces X",
  "Diablo Guards X",
  "Gravios Vambraces X",
  "Gravios Guards X",
  "Empress Vambraces X",
  "Empress Guards X",
  "Dragonclaw X",
  "Dragonfist X",
  "Dark Ukanlos Claw",
  "DarkUkanlosGauntlet",
  "Hypno Vambraces",
  "Hypno Guards",
  "Lava Vambraces",
  "Lava Guards"
};

// Waist
str WaistArmorID[410] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Leather Belt",
  "Light Belt",
  "Chain Belt",
  "Iron Belt",
  "Hunter's Tasset",
  "Hunter's Coat",
  "Bone Tasset",
  "Bone Coat",
  "Velociprey Tasset",
  "Velociprey Coat",
  "Battle Tasset",
  "Battle Coat",
  "Hide Belt",
  "Vespoid Tasset",
  "Vespoid Coat",
  "Hornet Tasset",
  "Hornet Coat",
  "Hi-Metal Tasset",
  "Hi-Metal Coat",
  "Genprey Tasset",
  "Genprey Coat",
  "Chrome Metal Coat",
  "Kut-Ku Tasset",
  "Kut-Ku Coat",
  "Ioprey Tasset",
  "Ioprey Coat",
  "Gypceros Tasset",
  "Gypceros Coat",
  "Cephalos Tasset",
  "Cephalos Coat",
  "Steel Belt",
  "Rathian Tasset",
  "Rathian Coat",
  "Khezu Tasset",
  "Khezu Coat",
  "Rathalos Tasset",
  "Rathalos Coat",
  "Basarios Tasset",
  "Basarios Coat",
  "Diablo Coil",
  "Diablo Coat",
  "Monoblos Coil",
  "Monoblos Coat",
  "Gravios Tasset",
  "Gravios Coat",
  "Black Belt Tasset",
  "Mosswine Hip",
  "Melahoa Skirt",
  "Bistro Apron",
  "Shinobi Belt (Sun)",
  "Shinobi Belt (Moon)",
  "Guardian Coil",
  "Guardian Coat",
  "Helper Skirt",
  "Healer Frills",
  "Garuga Tasset",
  "Garuga Coat",
  "Auroros Tasset",
  "Genesis Tasset",
  "Borealis Tasset",
  "Glyph Tasset",
  "Red Borealis Tasset",
  "Red Glyph Tasset",
  "Black Spine",
  "Black Scale",
  "Leather Belt U",
  "Chain Belt U",
  "Hunter's Tasset U",
  "Hunter's Coat U",
  "Bone Tasset U",
  "Bone Coat U",
  "Giaprey Tasset U",
  "Giaprey Coat U",
  "Battle Tasset U",
  "Battle Coat U",
  "Vespoid Tasset U",
  "Vespoid Coat U",
  "Hornet Tasset U",
  "Hornet Coat U",
  "Hi-Metal Tasset U",
  "Hi-Metal Coat U",
  "Genprey Tasset U",
  "Genprey Coat U",
  "Kut-Ku Tasset U",
  "Kut-Ku Coat U",
  "Ioprey Tasset U",
  "Ioprey Coat U",
  "Gypceros Tasset U",
  "Gypceros Coat U",
  "Cephalos Tasset U",
  "Cephalos Coat U",
  "Steel Belt U",
  "Rathian Heart Coil",
  "Rathian Heart Coat",
  "Khezu Tasset U",
  "Khezu Coat U",
  "Rathalos Soul Coil",
  "Rathalos Soul Coat",
  "Basarios Tasset U",
  "Basarios Coat U",
  "Diablo Coil U",
  "Diablo Coat U",
  "Monodevil Coil",
  "Monodevil Coat",
  "Gravios Tasset U",
  "Gravios Coat U",
  "Shinobi Belt (Sky)",
  "Shinobi Belt (Sea)",
  "Guardian Coil U",
  "Guardian Coat U",
  "Helper Skirt U",
  "Healer Frills U",
  "Auroros Tasset Ten",
  "Genesis Tasset Ten",
  "Borealis Tasset Ten",
  "Glyph Tasset Ten",
  "Fatalis Spine",
  "Fatalis Scales",
  "Golden Moon Tasset ",
  "Golden Moon Coat",
  "Silver Sol Tasset",
  "Silver Sol Coat",
  "Leather Belt S",
  "Chain Belt S",
  "Hunter's Tasset S",
  "Hunter's Coat S",
  "Bone Tasset S",
  "Bone Coat S",
  "Velociprey Tasset S",
  "Velociprey Coat S",
  "Battle Tasset S",
  "Battle Coat S",
  "Vespoid Tasset S",
  "Vespoid Coat S",
  "Hornet Tasset S",
  "Hornet Coat S",
  "Hi-Metal Tasset S",
  "Hi-Metal Coat S",
  "Genprey Tasset S",
  "Genprey Coat S",
  "Kut-Ku Tasset S",
  "Kut-Ku Coat S",
  "Ioprey Tasset S",
  "Ioprey Coat S",
  "Gypceros Tasset S",
  "Gypceros Coat S",
  "Cephalos Tasset S",
  "Cephalos Coat S",
  "Steel Belt S",
  "Rathian Tasset S",
  "Rathian Coat S",
  "Khezu Tasset S",
  "Khezu Coat S",
  "Rathalos Tasset S",
  "Rathalos Coat S",
  "Basarios Tasset S",
  "Basarios Coat S",
  "Diablo Coil S",
  "Diablo Coat S",
  "Monoblos Coil S",
  "Monoblos Coat S",
  "Gravios Tasset S",
  "Gravios Coat S",
  "Shinobi Belt(Heaven)",
  "Shinobi Belt (Earth)",
  "Red Guild Guard Coil",
  "Red Guild Guard Coat",
  "Red Guild Guard Coil",
  "Red Guild Guard Coat",
  "Auroros Tasset Haku",
  "Genesis Tasset Haku",
  "Borealis Tasset Haku",
  "Glyph Tasset Haku",
  "Dragon Spine S",
  "Dragon Scales S",
  "Hermitaur Tasset",
  "Hermitaur Coat",
  "Hermitaur Tasset U",
  "Hermitaur Coat U",
  "Hermitaur Tasset S",
  "Hermitaur Coat S",
  "Conga Tasset",
  "Conga Coat",
  "Conga Tasset U",
  "Conga Coat U",
  "Conga Tasset S",
  "Conga Coat S",
  "Blango Tasset",
  "Blango Coat",
  "Blango Tasset U",
  "Blango Coat U",
  "Blango Tasset S",
  "Blango Coat S",
  "Ceanataur Tasset",
  "Ceanataur Coat",
  "Ceanataur Tasset U",
  "Ceanataur Coat U",
  "Ceanataur Tasset S",
  "Ceanataur Coat S",
  "Kirin Hoop",
  "Kirin Shorts",
  "Kirin Hoop S",
  "Kirin Shorts S",
  "Kushala Cocoon",
  "Kushala Wind Wrap",
  "Mizuha Sash",
  "Extravagant Coat",
  "Empress Tasset",
  "Empress Coat",
  "Indra Wrap",
  "Steadfast Coat",
  "Kaiser Tasset",
  "Kaiser Coat",
  "Guardian Spirit Coil",
  "Carnage Wrap",
  "Golden Obi",
  "Puppet Master Obi",
  "White Fatalis Spine",
  "White Fatalis Scale",
  "Plesioth Tasset S",
  "Plesioth Coat S",
  "Black Belt Tasset S",
  "Remobra Belt",
  "Guild Knight Coat",
  "Guild Knight Kilt",
  "Maiden's Skirt",
  "Personal Frills",
  "Blue GuildGuard Coil",
  "Blue GuildGuard Coat",
  "Blue GuildGuard Coil",
  "Blue GuildGuard Coat",
  "Lobster Coil",
  "Lobster Coat",
  "Amezari Tasset",
  "Amezari Coat",
  "Mafumofu Coat",
  "Mafumofu Coat S",
  "Giaprey Tasset",
  "Giaprey Coat",
  "Melahoa Trunk",
  "Melahoa Skirt U",
  "Melahoa Trunk U",
  "Makluva Coat",
  "Makluva Fin",
  "Makluva Coat U",
  "Makluva Fin U",
  "Bistro Apron U",
  "Kut-Ku Tasset D",
  "Kut-Ku Coat D",
  "Gypceros Tasset D",
  "Gypceros Coat D",
  "Khezu Tasset D",
  "Khezu Coat D",
  "Obituary Anca",
  "Obituary Cocusa",
  "Butterfly Anca",
  "Butterfly Cocusa",
  "Obituary Anca S",
  "Obituary Cocusa S",
  "Butterfly Anca S",
  "Butterfly Cocusa S",
  "Kushala Cocoon S",
  "Kushala Wind Wrap S",
  "Tigrex Tasset",
  "Tigrex Coat",
  "Tigrex Tasset S",
  "Tigrex Coat S",
  "Death Stench Bowels",
  "Death Stench Belly",
  "DeathStench Bowels S",
  "Death Stench Belly S",
  "Diablo Coil D",
  "Diablo Coat D",
  "Gravios Tasset D",
  "Gravios Coat D",
  "Supreme Mizuha Sash",
  "SuprmExtravagantCoat",
  "Kaiser Tasset S",
  "Kaiser Coat S",
  "Rathian Heart Coil U",
  "Rathian Heart Coat U",
  "Rathalos Soul Coil U",
  "Rathalos Soul Coat U",
  "Ultimate Indra Wrap",
  "SupremeSteadfastCoat",
  "DarkAkantor Cincture",
  "Dark Akantor Sash",
  "Diasorte Coil",
  "Diasorte Coat",
  "Pirate J Coil",
  "Pirate J Skirt",
  "Hypno Tasset X",
  "Hypno Coat X",
  "Lava Tasset X",
  "Lava Coat X",
  "Garuga Tasset X",
  "Garuga Coat X",
  "Kut-Ku Tasset Z",
  "Kut-Ku Coat Z",
  "Gypceros Tasset Z",
  "Gypceros Coat Z",
  "Khezu Tasset Z",
  "Khezu Coat Z",
  "Basarios Tasset X",
  "Basarios Coat X",
  "Plesioth Tasset Z",
  "Plesioth Coat Z",
  "Hermitaur Tasset Z",
  "Hermitaur Coat Z",
  "Conga Tasset Z",
  "Conga Coat Z",
  "Rathian Heart Coil Z",
  "Rathian Heart Coat Z",
  "Rathalos Soul Coil Z",
  "Rathalos Soul Coat Z",
  "Ceanataur Tasset Z",
  "Ceanataur Coat Z",
  "Blango Tasset Z",
  "Blango Coat Z",
  "Auroros Tasset Goku",
  "Genesis Tasset Goku",
  "Borealis Tasset Goku",
  "Glyph Tasset Goku",
  "Golden Moon Coil Z",
  "Golden Moon Coat Z",
  "Silver Sol Coil Z",
  "Silver Sol Coat Z",
  "Diablo Coil Z",
  "Diablo Coat Z",
  "Gravios Tasset Z",
  "Gravios Coat Z",
  "Tigrex Tasset X",
  "Tigrex Coat X",
  "Indra Wrap Shin",
  "Steadfast Coat Shin",
  "Golden Obi Shin",
  "PuppetMasterObiShin",
  "Kirin Hoop X",
  "Kirin Shorts X",
  "Kushala Cocoon X",
  "Kushala Wind Wrap X",
  "Mizuha Sash Shin",
  "ExtravagantCoatShin",
  "Kaiser Tasset X",
  "Kaiser Coat X",
  "GuardianSprtCoilShin",
  "Carnage Wrap Shin",
  "Fatalis Spine Z",
  "Fatalis Scale Z",
  "WhiteFatalisSpineZ",
  "WhiteFatalisScaleZ",
  "Black Belt Tasset X",
  "Black Belt Coat X",
  "Melahoa Skirt Z",
  "Melahoa Trunk Z",
  "Makluva Coil Z",
  "Makluva Fin Z",
  "Chakra Tasset",
  "Hypno Tasset S",
  "Hypno Coat S",
  "Garuga Tasset S",
  "Garuga Coat S",
  "Narga Tasset S",
  "Narga Coat S",
  "Monodevil Coil U",
  "Monodevil Coat U",
  "Kut-Ku Tasset X",
  "Kut-Ku Coat X",
  "Conga Tasset X",
  "Conga Coat X",
  "Gypceros Tasset X",
  "Gypceros Coat X",
  "Khezu Tasset X",
  "Khezu Coat X",
  "Hermitaur Tasset X",
  "Hermitaur Coat X",
  "Plesioth Tasset X",
  "Plesioth Coat X",
  "Obituary Anca X",
  "Obituary Cocusa X",
  "Butterfly Anca X",
  "Butterfly Cocusa X",
  "Blango Tasset X",
  "Blango Coat X",
  "Monoblos Coil X",
  "Monoblos Coat X",
  "Ceanataur Tasset X",
  "Ceanataur Coat X",
  "Rathian Tasset X",
  "Rathian Coat X",
  "Rathalos Tasset X",
  "Rathalos Coat X",
  "Narga Tasset X",
  "Narga Coat X",
  "Diablo Coil X",
  "Diablo Coat X",
  "Gravios Tasset X",
  "Gravios Coat X",
  "Empress Coil X",
  "Empress Coat X",
  "Dragon Spine X",
  "Dragon Scales X",
  "DarkUkanlosCincture",
  "Dark Ukanlos Sash",
  "Hypno Tasset",
  "Hypno Coat",
  "Lava Tasset",
  "Lava Coat"
};

// Legs
str LegArmorID[421] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Green Pants",
  "Blue Pants",
  "Hunter's Greaves",
  "Hunter's Leggings",
  "Bone Greaves",
  "Bone Leggings",
  "Velociprey Greaves",
  "Velociprey Leggings",
  "Battle Greaves",
  "Battle Leggings",
  "Silver Metal Boots",
  "Vespoid Greaves",
  "Vespoid Leggings",
  "Hornet Greaves",
  "Hornet Leggings",
  "Hi-Metal Greaves",
  "Hi-Metal Leggings",
  "Dark Metal Boots",
  "Genprey Greaves",
  "Genprey Leggings",
  "Pink Metal Boots",
  "Chrome Metal Boots",
  "Ioprey Greaves",
  "Ioprey Leggings",
  "Gypceros Greaves",
  "Gypceros Leggings",
  "Cephalos Greaves",
  "Cephalos Leggings",
  "Rathian Greaves",
  "Rathian Leggings",
  "Khezu Greaves",
  "Khezu Leggings",
  "Rathalos Greaves",
  "Rathalos Leggings",
  "Plesioth Greaves",
  "Plesioth Leggings",
  "Basarios Greaves",
  "Basarios Leggings",
  "Diablo Greaves",
  "Diablo Leggings",
  "Monoblos Greaves",
  "Monoblos Leggings",
  "Gravios Greaves",
  "Gravios Leggings",
  "Black Belt Greaves",
  "Mosswine Feet",
  "Velociprey Feet",
  "Genprey Feet",
  "Ioprey Feet",
  "Shinobi Boots (Sun)",
  "Shinobi Boots (Moon)",
  "Guardian Boots",
  "Guardian Pants",
  "Helper Socks",
  "Healer Socks",
  "Garuga Greaves",
  "Garuga Leggings",
  "Auroros Pants",
  "Genesis Pants",
  "Borealis Pants",
  "Glyph Pants",
  "Red Borealis Pants",
  "Red Glyph Pants",
  "Black Feet",
  "Black Legs",
  "Cream Pants",
  "Coffee Pants",
  "Hunter's Greaves U",
  "Hunter's Leggings U",
  "Bone Greaves U",
  "Bone Leggings U",
  "Giaprey Greaves U",
  "Giaprey Leggings U",
  "Battle Greaves U",
  "Battle Leggings U",
  "Vespoid Greaves U",
  "Vespoid Leggings U",
  "Hornet Greaves U",
  "Hornet Leggings U",
  "Hi-Metal Greaves U",
  "Hi-Metal Leggings U",
  "Genprey Greaves U",
  "Genprey Leggings U",
  "Ioprey Greaves U",
  "Ioprey Leggings U",
  "Gypceros Greaves U",
  "Gypceros Leggings U",
  "Cephalos Greaves U",
  "Cephalos Leggings U",
  "Rathian HeartGreaves",
  "RathianHeartLeggings",
  "Khezu Greaves U",
  "Khezu Leggings U",
  "Rathalos SoulGreaves",
  "RathalosSoulLeggings",
  "Plesioth Greaves U",
  "Plesioth Leggings U",
  "Basarios Greaves U",
  "Basarios Leggings U",
  "Diablo Greaves U",
  "Diablo Leggings U",
  "Monodevil Greaves",
  "Monodevil Leggings",
  "Gravios Greaves U",
  "Gravios Leggings U",
  "Shinobi Boots (Sky)",
  "Shinobi Boots (Sea)",
  "Guardian Boots U",
  "Guardian Pants U",
  "Helper Socks U",
  "Healer Socks U",
  "Auroros Pants Ten",
  "Genesis Pants Ten",
  "Borealis Pants Ten",
  "Glyph Pants Ten",
  "Fatalis Feet",
  "Fatalis Legs",
  "Golden Moon Greaves",
  "Golden Moon Leggings",
  "Silver Sol Greaves",
  "Silver Sol Leggings",
  "Green Pants S",
  "Blue Pants S",
  "Hunter's Greaves S",
  "Hunter's Leggings S",
  "Bone Greaves S",
  "Bone Leggings S",
  "Velociprey Greaves S",
  "Velociprey LeggingsS",
  "Battle Greaves S",
  "Battle Leggings S",
  "Vespoid Greaves S",
  "Vespoid Leggings S",
  "Hornet Greaves S",
  "Hornet Leggings S",
  "Hi-Metal Greaves S",
  "Hi-Metal Leggings S",
  "Genprey Greaves S",
  "Genprey Leggings S",
  "Kut-Ku Greaves S",
  "Kut-Ku Leggings S",
  "Ioprey Greaves S",
  "Ioprey Leggings S",
  "Gypceros Greaves S",
  "Gypceros Leggings S",
  "Cephalos Greaves S",
  "Cephalos Leggings S",
  "Rathian Greaves S",
  "Rathian Leggings S",
  "Khezu Greaves S",
  "Khezu Leggings S",
  "Rathalos Greaves S",
  "Rathalos Leggings S",
  "Plesioth Greaves S",
  "Plesioth Leggings S",
  "Basarios Greaves S",
  "Basarios Leggings S",
  "Diablo Greaves S",
  "Diablo Leggings S",
  "Monoblos Greaves S",
  "Monoblos Leggings S",
  "Gravios Greaves S",
  "Gravios Leggings S",
  "ShinobiBoots(Heaven)",
  "Shinobi Boots(Earth)",
  "Red GuildGuard Boots",
  "RedGuildGuard Tights",
  "Red GuildGuard Boots",
  "RedGuildGuard Tights",
  "Auroros Pants Haku",
  "Genesis Pants Haku",
  "Borealis Pants Haku",
  "Glyph Pants Haku",
  "Dragonfeet S",
  "Dragonlegs S",
  "Hermitaur Greaves",
  "Hermitaur Leggings",
  "Hermitaur Greaves U",
  "Hermitaur Leggings U",
  "Hermitaur Greaves S",
  "Hermitaur Leggings S",
  "Conga Greaves",
  "Conga Leggings",
  "Conga Greaves U",
  "Conga Leggings U",
  "Conga Greaves S",
  "Conga Leggings S",
  "Blango Greaves",
  "Blango Leggings",
  "Blango Greaves U",
  "Blango Leggings U",
  "Blango Greaves S",
  "Blango Leggings S",
  "Ceanataur Greaves",
  "Ceanataur Leggings",
  "Ceanataur Greaves U",
  "Ceanataur Leggings U",
  "Ceanataur Greaves S",
  "Ceanataur Leggings S",
  "Kirin Leg Guards",
  "Kirin Boots",
  "Kirin Leg Guards S",
  "Kirin Boots S",
  "Kushala Crus",
  "Kushala Shank",
  "Mizuha Leg Wrap",
  "Extravagant Trousers",
  "Empress Greaves",
  "Empress Leggings",
  "Indra Leggings",
  "Steadfast Boots",
  "Kaiser Greaves",
  "Kaiser Leggings",
  "GuardianSpirit Boots",
  "Carnage Boots",
  "Golden Hakama",
  "Puppet Master Socks",
  "White Fatalis Feet",
  "White Fatalis Legs",
  "Black Belt Greaves S",
  "Giaprey Feet",
  "Remobra Feet",
  "Guild Knight Boots",
  "Guild Knight Tights",
  "Maiden's Stockings",
  "Personal Tights",
  "BlueGuildGuard Boots",
  "BlueGuildGuardTights",
  "BlueGuildGuard Boots",
  "BlueGuildGuardTights",
  "Lobster Greaves",
  "Lobster Leggings",
  "Amezari Greaves",
  "Amezari Leggings",
  "Mafumofu Boots",
  "Mafumofu Boots S",
  "Giaprey Greaves",
  "Giaprey Leggings",
  "Melahoa Roots",
  "Melahoa Taproot",
  "Melahoa Roots U",
  "Melahoa Taproot U",
  "Makluva Pants",
  "Makluva Leggings",
  "Makluva Pants U",
  "Makluva Leggings U",
  "Kut-Ku Greaves",
  "Kut-Ku Leggings",
  "Kut-Ku Greaves D",
  "Kut-Ku Leggings D",
  "Kut-Ku Greaves U",
  "Kut-Ku Leggings U",
  "Gypceros Greaves D",
  "Gypceros Leggings D",
  "Plesioth Greaves D",
  "Plesioth Leggings D",
  "Khezu Greaves D",
  "Khezu Leggings D",
  "Obituary Gamba",
  "Obituary Femur",
  "Butterfly Gamba",
  "Butterfly Femur",
  "Obituary Gamba S",
  "Obituary Femur S",
  "Butterfly Gamba S",
  "Butterfly Femur S",
  "Kushala Crus S",
  "Kushala Shank S",
  "Tigrex Greaves",
  "Tigrex Leggings",
  "Tigrex Greaves S",
  "Tigrex Leggings S",
  "Death Stench Heel",
  "Death Stench March",
  "Death Stench Heel S",
  "Death Stench March S",
  "Diablo Greaves D",
  "Diablo Leggings D",
  "Gravios Greaves D",
  "Gravios Leggings D",
  "SupremeMizuhaLegWrap",
  "SprmExtrvgntTrousers",
  "Kaiser Greaves S",
  "Kaiser Leggings S",
  "RathianHeartGreavesU",
  "RthianHeartLeggingsU",
  "RathalosSoulGreavesU",
  "RthalosSoulLeggingsU",
  "UltimateIndraLggings",
  "SupremSteadfastBoots",
  "Dark Akantor Hessian",
  "Dark Akantor Boots",
  "Diasorte Greaves",
  "Diasorte Leggings",
  "Pirate J Boots",
  "Pirate J Pants",
  "Famitsu Cloth Wrap",
  "Famitsu Cloth Wrap S",
  "Famitsu Shorts",
  "Famitsu Shorts S",
  "Hypno Greaves X",
  "Hypno Leggings X",
  "Lava Greaves X",
  "Lava Leggings X",
  "Garuga Greaves X",
  "Garuga Leggings X",
  "Kut-Ku Greaves Z",
  "Kut-Ku Leggings Z",
  "Gypceros Greaves Z",
  "Gypceros Leggings Z",
  "Khezu Greaves Z",
  "Khezu Leggings Z",
  "Basarios Greaves X",
  "Basarios Leggings X",
  "Plesioth Greaves Z",
  "Plesioth Leggings Z",
  "Hermitaur Greaves Z",
  "Hermitaur Leggings Z",
  "Conga Greaves Z",
  "Conga Leggings Z",
  "RathianHeartGreavesZ",
  "RathHeartLeggingsZ",
  "RathalosSoulGreavesZ",
  "RathSoulLeggingsZ",
  "Ceanataur Greaves Z",
  "Ceanataur Leggings Z",
  "Blango Greaves Z",
  "Blango Leggings Z",
  "Auroros Pants Goku",
  "Genesis Pants Goku",
  "Borealis Pants Goku",
  "Glyph Pants Goku",
  "GoldenMoonGreavesZ",
  "GoldenMoonLeggingsZ",
  "Silver Sol Greaves Z",
  "SilverSolLeggingsZ",
  "Diablo Greaves Z",
  "Diablo Leggings Z",
  "Gravios Greaves Z",
  "Gravios Leggings Z",
  "Tigrex Greaves X",
  "Tigrex Leggings X",
  "Indra Leggings Shin",
  "Steadfast Boots Shin",
  "Golden Hakama Shin",
  "PuppetMastrSocksShin",
  "Kirin Leg Guards X",
  "Kirin Boots X",
  "Kushala Crus X",
  "Kushala Shank X",
  "Mizuha Leg Wrap Shin",
  "ExtravgntTrousrsShin",
  "Kaiser Greaves X",
  "Kaiser Leggings X",
  "GuardianSprtBtsShin",
  "Carnage Boots Shin",
  "Fatalis Feet Z",
  "Fatalis Legs Z",
  "White Fatalis Feet Z",
  "White Fatalis Legs Z",
  "Black Belt Greaves X",
  "BlackBeltLeggingsX",
  "Melahoa Roots Z",
  "Melahoa Taproot Z",
  "Makluva Pants Z",
  "Makluva Leggings Z",
  "Chakra Anklet",
  "Hypno Greaves S",
  "Hypno Leggings S",
  "Garuga Greaves S",
  "Garuga Leggings S",
  "Narga Greaves S",
  "Narga Leggings S",
  "Monodevil Greaves U",
  "Monodevil Leggings U",
  "Kut-Ku Greaves X",
  "Kut-Ku Leggings X",
  "Conga Greaves X",
  "Conga Leggings X",
  "Gypceros Greaves X",
  "Gypceros Leggings X",
  "Khezu Greaves X",
  "Khezu Leggings X",
  "Hermitaur Greaves X",
  "Hermitaur Leggings X",
  "Plesioth Greaves X",
  "Plesioth Leggings X",
  "Obituary Gamba X",
  "Obituary Femur X",
  "Butterfly Gamba X",
  "Butterfly Femur X",
  "Blango Greaves X",
  "Blango Leggings X",
  "Monoblos Greaves X",
  "Monoblos Leggings X",
  "Ceanataur Greaves X",
  "Ceanataur Leggings X",
  "Rathian Greaves X",
  "Rathian Leggings X",
  "Rathalos Greaves X",
  "Rathalos Leggings X",
  "Narga Greaves X",
  "Narga Leggings X",
  "Diablo Greaves X",
  "Diablo Leggings X",
  "Gravios Greaves X",
  "Gravios Leggings X",
  "Empress Greaves X",
  "Empress Leggings X",
  "Dragonfeet X",
  "Dragonlegs X",
  "Dark Ukanlos Hessian",
  "Dark Ukanlos Boots",
  "Famitsu Cloth Wrap X",
  "Famitsu Pants X",
  "Hypno Greaves",
  "Hypno Leggings",
  "Lava Greaves",
  "Lava Leggings"
};

// Blademaster Weapons
str WepBMID[1151] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Carbalite Sword",
  "Carbalite Sword+",
  "Buster Sword",
  "Cat's Soul",
  "Supremacy Blade",
  "Buster Blade",
  "Blue Wing",
  "Ravager Blade",
  "Lacerator Blade",
  "Iron Katana",
  "Iron Katana Grace",
  "Iron Katana Gospel",
  "Bone Katana Wolf",
  "Bone Katana Shark",
  "Bone Katana Dragon",
  "Black Katana Mk.I",
  "Black Katana Mk.II",
  "Defender",
  "Wyvern Blade Blood",
  "Sentinel",
  "Halberd",
  "Wyvern Blade Leaf",
  "Judgment",
  "Executioner",
  "Executioner+",
  "Dark Scythe",
  "Tormentor",
  "Bone Blade",
  "Bone Blade+",
  "Agito",
  "Black Katana Mk.III",
  "Wyvern Agito",
  "Red Stripe",
  "Golem Blade",
  "Valkyrie Blade",
  "Sieglinde",
  "Dragonslayer",
  "Red Pincer",
  "Finblade",
  "Ceanataur Blade",
  "Plesioth Watersword",
  "Red Wing",
  "Rathalos Firesword",
  "Rusted Great Sword",
  "Tarnished Great Swd",
  "Blue Claw Blade",
  "Ancient Blade",
  "Bone",
  "Dragonwood L.Sword",
  "Fire Dragonsword",
  "Red Dragonsword",
  "Buster Sword+",
  "Sword of the Diablos",
  "Vile Serpentblade",
  "Iron Devil",
  "War Hammer+",
  "War Hammer",
  "Torment Hammer",
  "War Mace",
  "Iron Striker",
  "Bull Head Hammer",
  "Diablos Hammer",
  "Iron Impact",
  "Spiked Hammer",
  "Spiked Hammer+",
  "Crystal Hammer",
  "Crystal Nova",
  "Anvil Hammer",
  "Venom Monster",
  "Bone Axe",
  "Lobster Hammer",
  "Bone Broadaxe",
  "Gigaton Hammer",
  "Anchor Hammer",
  "Conehead Hammer",
  "Raven Torrent",
  "Graviton Hammer",
  "Hard Bone Hammer",
  "Hard Bone Hammer+",
  "Cyclo-Hammer",
  "Dragonhead Hammer",
  "Atlas Hammer",
  "Skullcrusher",
  "Skullcrusher+",
  "Kut-Ku Jaw",
  "Great Cone",
  "Titan Hammer",
  "Basarios Blow",
  "Diablos Maul",
  "Jail Hammer",
  "Jadite Mace",
  "Jade Mace",
  "Gunhammer Prototype",
  "Dead Revolver",
  "Rusted Hammer",
  "Tarnished Hammer",
  "Steel Ice Hammer",
  "Breath Core Hammer",
  "Bone Club",
  "Large Bone Club",
  "Dragon Destroyer",
  "Dragonbreaker",
  "Iron Lance",
  "Iron Lance+",
  "Knight Lance",
  "Growling Wyvern",
  "Knight Spear",
  "Paladin Lance",
  "Rampart",
  "Iron Gunlance",
  "Babel Spear",
  "Great Demon Hammer",
  "Iron Gunlance+",
  "Special Ops Gunlance",
  "Dark Lance",
  "Silver Rook",
  "Dark Spear",
  "Paralyzer",
  "Trident",
  "Bone Javelin",
  "Luna's Howl",
  "Spiked Spear",
  "Aqua Spear",
  "Luna's Roar",
  "Lullaby Spear",
  "White Gunlance",
  "Hard Bone Lance",
  "Hard Bone Lance+",
  "Longhorn+",
  "Black Gunlance",
  "Long Tusk",
  "Barbarian Tusk",
  "Hellsting",
  "Hard Hitter",
  "Ogre Tusk",
  "Red Tail",
  "Scissor Gunlance",
  "Dragonwood Gunlance",
  "Diablo Horn",
  "Aqua Spear+",
  "Diablo Spear",
  "Bone Claw Lance",
  "Crimson War Pike",
  "Venom Lance",
  "Blade Stinger",
  "Basarios Venom Spear",
  "Gravios Spear",
  "Gatling Lance",
  "Gatling Lance+",
  "Rusted Lance",
  "Tarnished Lance",
  "Ceanataur Stinger",
  "Undertaker",
  "Black Lance",
  "Demon Lance",
  "Odyssey",
  "Upper Battleaxe",
  "Hunter's Dagger",
  "Hunter's Dagger+",
  "Assassin's Dagger",
  "Kirin Bolt",
  "Kirin Bolt+",
  "Rusted Replica",
  "Kirin Bolt Ultimus",
  "Serpent Bite",
  "Velocidrome Bite",
  "Viper Bite",
  "Eternal Replica",
  "Deathprize",
  "Hydra Bite",
  "Flame Syphos",
  "Deadly Poison",
  "Thunderbane",
  "Princess Rapier",
  "Frightbane",
  "Princess Rapier+",
  "Poison Battleaxe",
  "Bone Kris",
  "Bone Kris+",
  "Osteon Pick",
  "Osteon Pick+",
  "Chief Kris",
  "Red Saber",
  "Master's Replica",
  "Djinn",
  "Blazing Falchion",
  "Weary Finsword",
  "Steel Ice Dagger",
  "Sandman Finsword",
  "Hero's Blade Replica",
  "Frost Edge",
  "Studded Club",
  "Frost Edge+",
  "Spiked Bat",
  "Crimson Club",
  "Monoblos Club",
  "Rusted Sword",
  "Tarnished Sword",
  "Blue Ogre Sword",
  "Eternal Strife",
  "Rajang Club",
  "Taboo Rajang Club",
  "Black Sword",
  "Raven Blade",
  "Catspaw",
  "Catburglar",
  "Tactical Blade",
  "Eager Cleaver",
  "Divine Slasher",
  "Chrome Razor",
  "Eternal Annihilator",
  "Finishing Hammer",
  "Onslaught Hammer",
  "Binder Mace",
  "Fist of Fury",
  "Grayburg Javelin",
  "Requiem Spear",
  "Spear of Prominence",
  "Black Dragon Spear",
  "Twin Kut-Ku",
  "Corona",
  "Black Dragon Sword",
  "Odyssey+",
  "Teddybear",
  "Estoc",
  "Ninja Sword",
  "Demon Rod",
  "Siegmund",
  "Frozen Tuna",
  "Great Demon Lance",
  "Valhalla",
  "Native Spear",
  "Polytan",
  "Twin Dagger",
  "Hi Twin Daggers",
  "Hurricane",
  "Pink Maracas",
  "Cyclone",
  "Dual Tomahawk",
  "Dual Tomahawk+",
  "Order Rapier",
  "Raven Tessen",
  "Holy Saber",
  "Prototype Saw-Slicer",
  "Sanctioned Blades",
  "Bone Scythe",
  "Bone Scythe+",
  "Cutlass",
  "Cutlass+",
  "Dual Diablo",
  "Dual Diablo+",
  "Insector",
  "Insector+",
  "Twin Flames",
  "Hi Twin Flames",
  "Gradios Ultimus",
  "Double Dragon",
  "Dual Dragon Ultimus",
  "Barbaroi Blade",
  "Crimson Goat",
  "Shiny Rathalos Sword",
  "Torment (Purgatory)",
  "White Disaster",
  "Velocidrome Bite+",
  "Gavas Twin Iron Fans",
  "Crimson Scythe",
  "White Mantis",
  "Sentoryu Raven",
  "Teostra Blade",
  "True Dragon's Jaw",
  "Saber",
  "Lion Dance Saber",
  "Guardian Sword",
  "True Devil Slicer",
  "White Serpentblade",
  "Plesioth Crystasword",
  "Scythe of Menace",
  "Enforcer's Axe",
  "Plesioth Azureblade",
  "Smolder Dragonsword",
  "Blushing Dame",
  "Pael Keizah",
  "Steel Ice Blade",
  "Steel Ice Blade+",
  "Devil Slicer",
  "Chrome Death Razor",
  "Eternal Eradicator",
  "Black Belt Blade",
  "Expert Blade",
  "Worn Great Sword",
  "Weathered Grt Sword",
  "Crab Cutter",
  "Epitaph Blade",
  "Bone Horn",
  "War Drum",
  "Sonic Glass",
  "Sonic Glass+",
  "Devil Masher",
  "Sanctioned Gunhammer",
  "War Stamp",
  "War Basher",
  "Metal Bagpipe",
  "Dragon Demolisher",
  "Khezu Horn",
  "Kut-Ku Pick",
  "Great Nova",
  "Blessed Ocarina",
  "Black Belt Hammer",
  "Expert Hammer",
  "Worn Hammer",
  "Weathered Hammer",
  "Iron Striker+",
  "Pulsating Core",
  "War Bongo",
  "Blood Horn",
  "Bronze Bell",
  "Dragonwood Horn",
  "Dark",
  "Sanctioned Gunlance",
  "Dragon Rider Spear",
  "Incessant Raven",
  "Black Ruiner Lance",
  "Black Tempest",
  "Steel Ice Spear",
  "Steel Ice Spear+",
  "Blue Tail",
  "Blue Prominence",
  "Thunderspear",
  "Black Gravios Spear",
  "Black Belt Lance",
  "Expert Lance",
  "Worn Spear",
  "Weathered Spear",
  "Teostra's Howl",
  "Matenro",
  "Dragonic Rim",
  "Void Gravios Spear",
  "Bladed Edge",
  "Bladed Edge+",
  "Odyssey Blade",
  "Deadly Battleaxe",
  "Kirin Bolt Indora",
  "Flaming Pair",
  "Black Ruiner Sword",
  "Cursed Spirit",
  "Rouge Flames",
  "Velociprey Claws",
  "Melting Wail",
  "Golden Falchion",
  "Sandman Spike",
  "High Sandman Spike",
  "Melynx Tool",
  "Black Belt Sword",
  "Expert Sword",
  "Hi Ninja Sword",
  "Thor's Dagger",
  "Ultimus Heaven&Earth",
  "Improved Power Saws",
  "Guild Knight Sabers",
  "Insect Slicer",
  "Corpse Blades",
  "Worn Blades",
  "Weathered Blades",
  "Melting Wail+",
  "Eternal Schism",
  "Obelion",
  "Titernia",
  "Ceramic Blos Lance",
  "Death Venom Hammer",
  "Legendary Replica",
  "Demon Halberd",
  "Rusty Claymore",
  "Grind Claymore",
  "Polytan G",
  "Chick Decapitator",
  "Great Demon Rod",
  "Kirin Thundersword",
  "Black Blade",
  "Kirin Bolts",
  "Ravager Blade+",
  "Susano Blade",
  "Daimyo Cutter",
  "Wyvern Blade Verde",
  "Lion King Saber",
  "Monoblos Scythe",
  "Frost Ripper",
  "Imperial Sword",
  "Fanatic Dragonwd LS",
  "Wyvern Blade Maple",
  "Great Demon Halberd",
  "Gaelic Flame",
  "Bone Horn+",
  "War Drum+",
  "Glass Queen",
  "Khezu Flute",
  "Great Bagpipe",
  "Cursed Ocarina",
  "War Conga",
  "Blood Flute",
  "Gaoren Bell",
  "Spirit Dragonwd Horn",
  "Steel Gunlance",
  "Big Slugger",
  "Hellstinger",
  "White Cannon",
  "Luna's Flare",
  "Scissor Cannon",
  "Black Gore Cannon",
  "Gun Chariot",
  "Gld Dragonwd GLance",
  "Imperial Gunlance",
  "Great Pincer",
  "King Thundersword",
  "Daora's Decimator",
  "Killer's Scythe",
  "Sentoryu Wolf",
  "Rooster Decapitator",
  "Chicken Decapitator",
  "Diablo Destroyer",
  "King Teostra Blade",
  "Fatalis Blade",
  "Fatalis Ancestor",
  "Cat's Curse",
  "Bull Tusk Hammer",
  "Conehead Hammer+",
  "Lunastra's Crown",
  "Anchor Crusher",
  "Wolf Torrent",
  "Ancient Blow",
  "Diablo Chaos Broker",
  "Ancient Relic",
  "Basarios Bash",
  "Daora's Colossus",
  "White Cat Hammer",
  "Black Cat Stamp",
  "Gold Cat Hammer",
  "King Lobster Hammer",
  "Violence Hammer",
  "Bone Claw Lance+",
  "Daora's Fang",
  "Ceanataur Piercer",
  "Incessant Wolf",
  "Roaring Wyvern",
  "Thunderlance",
  "Teostra's Roar",
  "Sealed Dragonlance",
  "Emerald Spear",
  "Strategic Blade",
  "Black Doom Flame",
  "Queen Rapier",
  "Daora's Razor",
  "Hi Frost Edge",
  "Azure Ogre Sword",
  "Wolf Blade",
  "Twin Kut-Ku+",
  "Funky Maracas",
  "Limb Cutter",
  "Wolf Tessen",
  "Crimson Lotus Blades",
  "Dual Chameleos",
  "Hi Velociprey Claws",
  "Spatula Set",
  "Silhouette Sabers",
  "Rookie Knife",
  "Khezu Shock Sword",
  "Khezu Shock Blade",
  "Cat's King",
  "Dos Fang Dagger",
  "Melynx Gadget",
  "Anchor Hammer+",
  "Shining Wyvern Blade",
  "Gavas LS Fan",
  "Black Hammer",
  "Poison Serpentblade",
  "Fatalis Buster",
  "AncientFatalisBuster",
  "Shell Hammer",
  "Wyvern Blade Holly",
  "Large Bone",
  "Blango Destroyer",
  "Blango Destroyer+",
  "Blango Decimator",
  "Blango Destructor",
  "Centenarian Dagger",
  "Great Ogre Tusk",
  "Silver Serpentblade",
  "Golden Serpentblade",
  "Deadly Serpentblade",
  "Bronze Coin",
  "Gaoren Coin",
  "Bone Slasher",
  "Golem Blade+",
  "Spartacus Blade",
  "Wyvern Blade Fall",
  "Crystallized Tuna",
  "Tiger Agito",
  "Tigrex Great Sword",
  "Tigrex Tooth",
  "Tigrex Katana",
  "Akantor Katana",
  "Steel Lance",
  "Naag Serpentblade",
  "Devta Serpentblade",
  "Gravios Venom Spear",
  "Marine Fisher",
  "Deep Fisher",
  "Deep Ocean",
  "Sea King Gunlance",
  "Snow Gunlance",
  "Snow Gunlance Mk. II",
  "Blizzard Gunlance",
  "Longhorn",
  "Barbaroi Tusk",
  "Crimson Lance",
  "Ceramic Blos Lance+",
  "Wild Bone Lance",
  "Wild Bone Lance+",
  "Bulldrome Spear",
  "Fragrance",
  "Fragrance+",
  "Noble Fragrance",
  "Bone Gunlance",
  "Great Bone Gunlance",
  "Wyvern Bone Gunlance",
  "Hellsting+",
  "Average Hitter",
  "Grand Slam",
  "Vermillion Rim",
  "Vacuum Striker",
  "Hyper Vacuum",
  "Primal Spear",
  "Tiger Stinger",
  "Tigrex Lance",
  "Rex Blast",
  "Tigrex Gunlance",
  "Akantor Gunlance",
  "Kitchen Knife",
  "Iron Chefblade",
  "Millennium Knife",
  "Velociprey Claws+",
  "Giaprey Claws",
  "Giaprey Claws+",
  "White Death",
  "Snake Bite",
  "Snake Bite+",
  "Twin Dagger+",
  "Glutton's Set",
  "Chereau's Tool",
  "Serpent Bite+",
  "Chief Scythe",
  "Dual Kut-Ku",
  "Pink Maracas+",
  "Shaka Poison Bite",
  "Shakalaka Saber",
  "Felyne and Melynx",
  "Steel Ice Dagger+",
  "Rex Talon",
  "Tigrex Sword",
  "Rex Slicers",
  "Tigrex Claws",
  "Sakura Recorder",
  "Gold Recorder",
  "Black Cauldron",
  "True Black Cauldron",
  "One Star Silver Pot",
  "Two Star Silver Pot",
  "Bone Great Axe",
  "Crater Maker",
  "Basarios Rock",
  "Volcanic Rock",
  "Enormous Ham",
  "Ham of Hams",
  "Basarios Rock Mk.II",
  "Dynamic Hammer",
  "Sakura Recorder+",
  "Khezu Horn+",
  "Giadrome Balloon",
  "Bull Hammer",
  "Giaprey Balloon",
  "Giaprey Balloon+",
  "Ivory Horn",
  "White Cat Stamp",
  "Black Cat Hammer",
  "Cactus Creamer",
  "Green Monster",
  "Striped Striker",
  "Tigrex Hammer",
  "Striped Dragonga",
  "Tigrex Horn",
  "Akantor Horn",
  "Amezari Hammer",
  "Akantor Blades",
  "Khezu Shock Full",
  "Khezu Shock Full+",
  "Cat of Venus",
  "Cat of Gold",
  "Wailing Cleaver",
  "Wailing Cleaver Shin",
  "Mirage Finsword",
  "Mirage Finsword+",
  "Phantom Mirage",
  "Lion Emperor Saber",
  "Big Menacing Scythe",
  "Monoblos Scythe+",
  "Weiss Crescent",
  "C.Blango Decimator",
  "C.Blango Destructor",
  "Master Blaze",
  "Decider",
  "Punisher",
  "Igneous Blade",
  "Igneous Sword",
  "Liquid Fire Blade",
  "Divine Fire Blade",
  "GrtDemnHalberdRaksha",
  "Gaoren Cleaver",
  "Aqua Guardian",
  "Atlantica",
  "Edelweiss Ice Blade",
  "Edelweiss Ice Blade+",
  "Alveblade",
  "Br\xFCnhild",
  "Plesioth Wave Sword",
  "Plesioth Wave Blade",
  "Hermitaur Slicer",
  "Hermitaur Slasher",
  "Violet Pincer",
  "Grand Pincer",
  "Shogun Cutter",
  "Killer's Sickle",
  "Carmine Blade",
  "Killer's Carver",
  "Pickaxe Blade",
  "Pickaxe Blade+",
  "Sleep Sword Zantoma",
  "Slaughter",
  "Slaughter+",
  "Poison King",
  "Sentoryu Crow",
  "Daito Wolf",
  "Daito Crow",
  "Hellish Slasher",
  "Knockout Dragonsword",
  "WyvernBlade Silver",
  "WyvrnBlade Camellia",
  "Lost Black Katana",
  "Final Black Katana",
  "ImperialThundersword",
  "King Atillart Sword",
  "Great Demon Hot Rod",
  "Last Gaelic Flame",
  "Eternal Destroyer",
  "Black Fatalis Blade",
  "Fatalis Legacy",
  "Black Scythe",
  "Fatalis Sickle",
  "LgndaryFatalisSickle",
  "Great Hornfly Saber",
  "ExceptnlHornflySaber",
  "AncientDragonwoodLS",
  "AncientSlayrDrgnwdLS",
  "Daora's Tughril Beg",
  "Icesteel Blade",
  "Daora's Raid",
  "Epitaph Eternal",
  "Teostra del Sol",
  "10k Gavas LS Fan",
  "Tigrex Supreme Sword",
  "Hidden Blaze",
  "Darkness Darkblade",
  "Tigrex Great Katana",
  "Hidden Saber",
  "Shadow of the Moon",
  "Akantor Broadsword",
  "Akantor Broadsword+",
  "Akantor Broadswrd S",
  "Ukanlos Destructor",
  "Ukanlos Slicer",
  "Buster Blade G",
  "Ravager Blade G",
  "Chrome Razor G",
  "Tactical Blade G",
  "Cat's Soul G",
  "Sentinel G",
  "Barbaroi Blade G",
  "Judgment G",
  "GoldnSerpentblade G",
  "Great Serpentblade G",
  "PoisnSerpentblade G",
  "Carbalite Sword G",
  "Iron Katana G",
  "Eager Cleaver G",
  "Saber G",
  "Tormentor G",
  "Crimson Scythe G",
  "Frost Ripper G",
  "Blango Destroyer G",
  "Blango Destructor G",
  "Imperial Sword G",
  "Bone Blade G",
  "Golem Blade G",
  "Siegmund G",
  "Sieglinde G",
  "Pael Keizah G",
  "Blushing Dame G",
  "Executioner G",
  "Enforcer's Axe G",
  "Plesioth Waterswd G",
  "Plesioth Crystaswd G",
  "Red Stripe G",
  "Great Pincer G",
  "Daimyo Cutter G",
  "Killer's Scythe G",
  "Decapitator G",
  "Rathalos Firesword G",
  "ShinyRathalosSwd G",
  "Wyvern Agito G",
  "True Dragon's Jaw G",
  "Bone G",
  "BoneKatan Dragon G",
  "Red Dragonsword G",
  "WyvernBlade Maple G",
  "WyvernBlade Holly G",
  "Black Katana G",
  "Susano Blade G",
  "FanaticDragonwdLS G",
  "EternlAnnihilator G",
  "Crystallized Tuna G",
  "Black Belt Blade G",
  "Warrior's Blade",
  "TarnishdGreatSwd G",
  "Ancient P G",
  "Amezari Sword",
  "Pirate J Sword",
  "Severed Roar",
  "G Blade",
  "SanctionedDrillLance",
  "Gravedigger",
  "OuroborosSerpntblade",
  "Gravios Lance",
  "Gravios Fire Lance",
  "Naar Thunderlance",
  "Gun Chariot+",
  "World's End",
  "Luna's Sun",
  "Black Gore Buster",
  "Sea God Leviathan",
  "Sea Abyss",
  "Volcano Gunlance",
  "Lavasioth Gunlance",
  "Lost Babel",
  "Sadalsuud",
  "Sadalmelek",
  "Aquarius",
  "Ancient Destroyer",
  "Genesis",
  "Spark Plug",
  "ThunderbugShockLance",
  "Cold Icicle",
  "Frost Icicle",
  "Icicle Blizzard",
  "Feather Gunlance",
  "Feather Gunlance+",
  "Hypno Cannon",
  "Dragoon's G\xE1e Bulg",
  "Incessant Crow",
  "Crimson War Pike+",
  "White Catastrophe",
  "Rising Tempest",
  "Violet Cannon",
  "Violet Buster",
  "Shell Claw Lance",
  "GiantHermitaurLance",
  "Carmine Stinger",
  "Shish Kabob Stick",
  "Darkness",
  "Prominence Soul",
  "Demonic Blizzard",
  "Desert Slingshot",
  "Desert Slinger",
  "Triple Crown",
  "Venomous Cologne",
  "Venomous Attar",
  "Venomous Perfume",
  "Giant Tusk",
  "Brutal Tusk",
  "Heavy Bone Gunlance",
  "Hard Bone Cannon",
  "Full Voltage",
  "Full Generator",
  "High Volt Gunlance",
  "Demonlance Rajang",
  "DragonSealer Virtue",
  "DragonSealer Null",
  "Pop Corn",
  "Large Pop Corn",
  "True Blk Dragon Spr",
  "True Blk Dragon Spr+",
  "Black Smoke Gunlance",
  "BlackDragonGunlance",
  "TrueBlkDrgnGunlance",
  "AncientDrgnwoodLance",
  "AncientDrgnwoodLanc+",
  "Daora's Regulus",
  "Sky Scraper",
  "Teostra's Fire",
  "Great Tigrex Lance",
  "Hidden Stinger",
  "Black Rain Darklance",
  "GreatTigrexGunlance",
  "Hidden Gunlance",
  "WanningMoonDarklance",
  "AkantorNoirGunlance",
  "Ukanlos Calamity",
  "UkanlosBlazeGunlance",
  "Iron Lance G",
  "Rampart G",
  "Roaring Wyvern G",
  "Gatling Lance G",
  "SanctionedGunlance G",
  "Valhalla G",
  "Spiked Spear G",
  "Requiem Spear G",
  "Trident G",
  "Venom Lance G",
  "Gravios Spear G",
  "BlackGraviousSpear G",
  "Iron Gunlance G",
  "Imperial Gunlance G",
  "White Cannon G",
  "Marine Fisher G",
  "Blizzard Gunlance G",
  "Knight Spear G",
  "Aqua Spear G",
  "Emerald Spear G",
  "Grayburg Javelin G",
  "Long Tusk G",
  "Great Ogre Tusk G",
  "Crimson War Pike G",
  "Ceramic Blos Lance G",
  "Diablo Spear G",
  "Bone Claw Lance G",
  "Scissor Cannon G",
  "Ceanataur Piercer G",
  "Dark Spear G",
  "Bulldrome Spear G",
  "SpearOfProminence G",
  "Fragrance G",
  "Noble Fragrance G",
  "WyvernBoneGunlance G",
  "Grand Slam G",
  "Hard Bone Lance G",
  "Barbarian Tusk G",
  "Sealed Dragonlance G",
  "Hyper Vacuum G",
  "Native Spear G",
  "Black Belt Lance G",
  "Warrior's Lance",
  "GldDragonwdGLance G",
  "Tarnished Lance G",
  "Undertaker G",
  "EldrDrgnGLanceEmblem",
  "Crow Blade",
  "Dual Battleaxe",
  "Dual Battleaxe+",
  "Final Battleaxe",
  "Snow Venom",
  "Snow Venom+",
  "Glacial Medusa",
  "Queen's Rose",
  "Royal Rose",
  "ChameleosDualBlades",
  "Ice Fang",
  "Freezing Daggers",
  "Icicle Daggers",
  "Frozen Death",
  "Master Sabers",
  "Holy Guild Knight",
  "Alated Insect",
  "Insect Lord",
  "Master Odyssey",
  "Heavy Bang",
  "Master Bang",
  "Thunderblade Vajra",
  "Thunderblade Vajra+",
  "Tornado Tomahawks",
  "Typhoon",
  "Firestorm",
  "Volcanic Storm",
  "Divine Power Saws",
  "Black Curse",
  "Blos Doppelganger",
  "Grand Blos",
  "Festive Fall Typhoon",
  "FestiveRustlingRain",
  "Golden Falchion+",
  "Golden Eclipse",
  "Punishment Blades",
  "Red Divine Flame",
  "Carmine Edge",
  "Red Rippers",
  "Dual Carapace",
  "Dual Carapace+",
  "Dual Scissors",
  "Twin Shells",
  "Twin Shears",
  "Crow Tessen",
  "Jungle Maracas",
  "Evergreen",
  "Binding Blade",
  "Binding Blade+",
  "Feather Knife",
  "Feather Sword",
  "Hi Feather Sword",
  "Melting Blazer",
  "ForbiddenRajangClub",
  "Hexed Shaka Hatchet",
  "Hexed Shaka Sword",
  "Demonic Flaming Pair",
  "Azure Dual Swords",
  "Indigo Ogre Sword",
  "True Blk Dragon Swd",
  "True Blk Ruiner Swd",
  "Dual Dragon Ultimus+",
  "Black Twin Daggers",
  "Fatalis Dual Blades",
  "Fatalis Dual Sky",
  "Ultimus Celestials",
  "Ultimus Apocalypse",
  "Daora's Maelstrom",
  "Twin Nails",
  "Twin Nails+",
  "Fire and Ice",
  "Eternal Sacrifice",
  "100GavasTwinIronFans",
  "10kGavasTwinIronFans",
  "Tigrex Sword+",
  "Hidden Edge",
  "Midnight Blades",
  "Tigrex Claws+",
  "Hidden Ones",
  "Ebony Wings",
  "Akantor Shadow Claws",
  "Ukanlos Soul Hatchet",
  "UkanlosRuinerBlades",
  "Hunter's Dagger G",
  "Velocidrome Bite G",
  "Thunderbane G",
  "Kirin Bolt Indora G",
  "Poison Battleaxe G",
  "Deadly Battleaxe G",
  "Millennium Knife G",
  "White Death G",
  "Velociprey Claws G",
  "Snake Bite G",
  "Deathprize G",
  "Deadly Poison G",
  "Queen Rapier G",
  "Hi Frost Edge G",
  "Dual Tomahawk G",
  "Holy Saber G",
  "Hi Ninja Sword G",
  "Insector G",
  "Glutton's Set G",
  "Spatula Set G",
  "Odyssey G",
  "Serpent Bite G",
  "Cyclone G",
  "PrototypeSaw-Slicr G",
  "Chief Kris G",
  "Monoblos Club G",
  "Spiked Bat G",
  "Dual Diablo G",
  "Kirin Bolt G",
  "Kirin Bolt+ G",
  "Thor's Dagger G",
  "Kirin Bolts G",
  "Sandman Finsword G",
  "High Sandman Spike G",
  "Djinn G",
  "Blazing Falchion G",
  "Corona G",
  "Gradios Ultimus G",
  "Bone Scythe G",
  "Limb Cutter G",
  "Cutlass G",
  "Dual Kut-Ku G",
  "Funky Maracas G",
  "Osteon Pick G",
  "Catburglar G",
  "Melynx Tool G",
  "Shakalaka Saber G",
  "CrimsonLotusBlades G",
  "Master's Blade G",
  "Legendary Blades G",
  "Eternal Treasure G",
  "DualDragonUltimus G",
  "Warrior's Sword",
  "Tarnished Sword G",
  "Worn Blades G",
  "Eternal Strife G",
  "Silhouette Sabers G",
  "ShiningWyvernBlade G",
  "Amezari Claws",
  "Blacksmith",
  "Juggernaut",
  "Lava Alphorn",
  "Volcano Alphorn",
  "Gaoren Zhong",
  "Gold Recorder+",
  "Lunar Recorder",
  "Regulation GunHammer",
  "ImperialGunHmmrSpark",
  "Ceanataur Head Axe",
  "Big Blue Chopper",
  "Carmine Axe",
  "The Great Divider",
  "Heavy Bagpipe",
  "Heavy Bagpipe+",
  "Master Bagpipe",
  "Sforzando",
  "Super Nova",
  "VenomousCraterMaker",
  "Glasya-Labolas",
  "Volcanic Gig",
  "Devil Masher+",
  "Iron Devil's Soul",
  "Iron Repellant",
  "Icy Impact",
  "Axion",
  "Foolhardy Stone Fist",
  "Feather Whistle",
  "Hypno Whistle",
  "Hypno Slide Whistle",
  "Crow Torrent",
  "Wolf Shamisen",
  "Crow Shamisen",
  "Mysterious Jaw",
  "Purple Mace",
  "Pitohui Bird Mace",
  "Blood Flute+",
  "Brute Flute",
  "Purse Bop",
  "Purse Bop+",
  "Khezu Thunder",
  "Shell Castanet",
  "Shell Castanet+",
  "Bi-Colored Castanet",
  "Crabby Castanet",
  "Klick-Klack",
  "Glass Royale",
  "Queen's Flute",
  "Desert Cone",
  "Magnitude",
  "Giadrome Balloon G",
  "Velociprey Balloon",
  "Velociprey Balloon+",
  "Velocidrome Balloon",
  "Velocidrome Balloon+",
  "Hunter's Horn",
  "Hunter's Horn+",
  "Native's Horn",
  "Genie's Ocarina",
  "Conga Conga",
  "Jungle Bongo",
  "Jungle Conga",
  "Chaotic Order",
  "Royal Lobster Hammer",
  "Claw of Doom",
  "Gold Cat Crusher",
  "Fatalis Demolisher",
  "AncientFatalisRuiner",
  "Black Lute",
  "Fatalis Menace",
  "Fatalis Menace Lute",
  "Ancient Fatalis Lied",
  "Ancient Fatalis Lute",
  "AncientDrgnwoodFlute",
  "DivineAncDrgnwdFlute",
  "Handmade Frog",
  "Handcrafted Frog",
  "Luna's Skirt",
  "Pulse Crusher Core",
  "Daora's Hyperborea",
  "True Polytan G",
  "Amezari Hammer+",
  "Amezari Impact",
  "Tigrex Hammer+",
  "Hidden Breaker",
  "Deep Darkhammer",
  "Tigrex Horn+",
  "Hidden Tone",
  "Demon's Darkflute",
  "Akantor Dark Melody",
  "Ukanlos Trampler",
  "Ukanlos Horned Flute",
  "War Hammer G",
  "Iron Striker G",
  "Onslaught Hammer G",
  "War Basher G",
  "Sakura Recorder G",
  "Dead Revolver G",
  "SanctionedGunHammr G",
  "Anchor Crusher G",
  "TrueBlackCauldron G",
  "TwoStarSilverPot G",
  "Bone Axe G",
  "Great Bagpipe G",
  "Heavy Bagpipe G",
  "Spiked Hammer G",
  "Crystal Nova G",
  "Titan Hammer G",
  "Crater Maker G",
  "Torment(Purgatory) G",
  "Basarios Rock G",
  "Great Demon Hammer G",
  "Bone Club G",
  "Enormous Ham G",
  "Atlas Hammer G",
  "Kut-Ku Jaw G",
  "Kut-Ku Pick G",
  "Venom Monster G",
  "Binder Mace G",
  "Khezu Flute G",
  "Skullcrusher G",
  "Finishing Hammer G",
  "Dragonhead Hammer G",
  "Basarios Bash G",
  "Glass Queen G",
  "Great Cone G",
  "Bull Tusk Hammer G",
  "Velociprey Balloon G",
  "Bone Horn G",
  "War Drum G",
  "Hard Bone Hammer G",
  "Dragonbreaker G",
  "White Cat Hammer G",
  "Black Cat Hammer G",
  "Teddybear G",
  "Cactus Creamer G",
  "SpiritDragonwdHorn G",
  "Black Belt Hammer G",
  "Warrior's Hammer",
  "Tarnished Hammer G",
  "Breath Core Hammer G",
  "Original Polytan G",
  "Felyne and Melynx+",
  "Ms. M.H. Puppet",
  "Great Kris"
};

// Gunner Weapons
str WepGunID[355] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Shooter's Barrel",
  "Chain Blitz",
  "Shotgun (White)",
  "Shotgun (Azure)",
  "Shotgun (Green)",
  "Shotgun (Blood)",
  "Desert Storm",
  "Sandfall",
  "Maelstrom",
  "Jade Storm",
  "Lobster Gun",
  "Amezari Crossbow",
  "Tail String",
  "Tail String+",
  "Kut-Ku Anger",
  "Kut-Ku Rage",
  "Raven Do",
  "Angel Parasol",
  "Sakura Parasol",
  "Tigrex Tank",
  "Grenade Launcher",
  "Titan Launcher",
  "Uranos Grenade",
  "Valkyrie Fire",
  "Valkyrie Heart",
  "Spartacus Fire",
  "Spartacus Soul",
  "Azure Sakura",
  "Felyne Ragdoll",
  "Melynx Ragdoll",
  "Black Belt Bowgun",
  "Demonlock",
  "Blessed Lamp",
  "Black Parasol",
  "Great Crossbow Gun",
  "Hornet Gun",
  "Bullet Storm",
  "Aqua Blade Shower",
  "Green Blade Shower",
  "Crimson Blade Shower",
  "Desert Tempest",
  "Sandfall+",
  "Maelstrom+",
  "Jade Tempest",
  "King Lobster Gun",
  "Tail Catapult",
  "Wolf Do",
  "Peach Parasol",
  "Tigrex Wargun",
  "Grenade Launcher+",
  "Titan Launcher+",
  "Chronos Grenade",
  "Rajang Barrage",
  "Valkyrie Blaze",
  "Valkyrie Heart+",
  "Gold Valkyrie",
  "Spartacus Blaze",
  "Spartacus Soul+",
  "Silver Spartacus",
  "Crimson Blue",
  "Supreme Azure Sakura",
  "Profusion",
  "Fire Wrath",
  "Felyne Helldoll",
  "Melynx Helldoll",
  "Expert Bowgun",
  "Island of the Gods",
  "Cursed Lamp",
  "Dark Parasol",
  "Bone Shooter",
  "Rapidcaster",
  "Monodevilcaster",
  "Duelcaster",
  "Quickcaster",
  "Injector Cannon",
  "Flechette Gun",
  "Ladybug Cannon",
  "Yian Kut-Ku Cannon",
  "Blue Kut-Ku Cannon",
  "Raven Heirloom",
  "Tankmage",
  "Bastionmage",
  "Crab Buster",
  "Meteor Cannon",
  "Rock Eater",
  "Tigrex Howl",
  "Daora's Delphinidae",
  "Lunastra's Cannon",
  "Teostra's Artillery",
  "Lao-Shan Lung Cannon",
  "Bronze Fire",
  "Black Cannon",
  "Great Arbalest",
  "Monodevilcaster+",
  "Duelcaster+",
  "Quickcaster+",
  "Honeycomber",
  "Ladybug Cannon+",
  "Mega Kut-Ku Cannon",
  "Wolf Heirloom",
  "Tankmage+",
  "Blastion Cannon",
  "Heavy Buster Crab",
  "Meteor Buster",
  "Earth Eater",
  "Tigrex Skull",
  "Gravios Howl",
  "Gravios Roar",
  "Daora Grande",
  "Teostra's Flames",
  "Supreme Lao-Shan Can",
  "Empr Lao-Shan Cannon",
  "Gaoren's Fire",
  "Vor Cannon",
  "Destiny's Hand",
  "Hunter's Bow I",
  "Hunter's Bow II",
  "Hunter's Bow III",
  "Hunter's Bow IV",
  "Hunter's Power BowI",
  "Hunter's Power BowII",
  "Hunter's PowerBowIII",
  "Wild Bow I",
  "Wild Bow II",
  "Wild Bow III",
  "Wild Bow IV",
  "Wild Power Bow I",
  "Wild Power Bow II",
  "Blango Fur Bow I",
  "Blango Fur Bow II",
  "Blango Fur Bow III",
  "Blango Fur Bow IV",
  "Abominable Bow I",
  "Kut-Ku Stave I",
  "Kut-Ku Stave II",
  "Kut-Ku Stave III",
  "Blue Kut-Ku Stave I",
  "Daimyo's Warbow I",
  "Daimyo's Warbow II",
  "Daimyo's Warbow III",
  "Daimyo's Warbow IV",
  "Sonic Bow I",
  "Sonic Bow II",
  "Sonic Bow III",
  "Queen Blaster I",
  "Queen Blaster II",
  "Queen Blaster III",
  "Heartshot Bow I",
  "Heartshot Bow II",
  "Prominence Bow I",
  "Prominence Bow II",
  "Prominence Bow III",
  "Courageous Hope",
  "Courageous Wish",
  "Diablos Horn Bow I",
  "Diablos Horn Bow II",
  "Tiger Arrow I",
  "Tiger Arrow II",
  "Tigrex Whisker",
  "Dragonhead Harp I",
  "Dragon Bow Halo",
  "Dragon Bow Solar",
  "Dragon Bow Earth",
  "Dragon Bow Mountain",
  "Akantor Bow",
  "Exterminator Bow I",
  "Glorious Victory I",
  "Assault Conga",
  "Shakalaka Prized Bow",
  "Assault Conga+",
  "Hidden Gaze",
  "Hi Chain Blitz",
  "Nebula Storm",
  "Jade Typhoon",
  "Royal Lobster Gun",
  "Hexed Shaka Bow",
  "Heartfelt Cast",
  "Combat Conga",
  "Jungle Assault",
  "Kut-Ku Counterattack",
  "Kut-Ku Barrage",
  "Owl's Eye Darkbow",
  "Grenade Revolver",
  "Warrior's Bowgun",
  "Fierce Moss Green",
  "Fierce Wine Red",
  "Promenade",
  "Shotgun (Snake)",
  "Sakura Semi-Auto",
  "Azure Semi-Auto",
  "Pollination",
  "Tail Launcher",
  "Crow Do",
  "Lava Storm",
  "Desert Tail",
  "Mythical Three-Horn",
  "Gold Semi-Auto ",
  "Silver Semi-Auto",
  "Prosperity",
  "Genie's Lamp",
  "Titan Panzer",
  "Chronos Panzer",
  "EngravedFireWyvnBow",
  "Ten-Thousand Volts",
  "Tigrex Wargun+",
  "Absolute Bow",
  "Ukanlos Flame Bow",
  "Island of the Gods G",
  "Crossbow Gun G",
  "Shotgun (White) G",
  "Shotgun (Azure) G",
  "Shotgun (Emerald) G",
  "Shotgun (Blood) G",
  "Hornet Gun G",
  "Desert Tempest G",
  "Sandfall G",
  "Angel Parasol G",
  "Peach Parasol G",
  "Felyne Helldoll G",
  "Melynx Helldoll G",
  "Maelstrom G",
  "Jade Typhoon G",
  "King Lobster Gun G",
  "Amezari Crossbow G",
  "Hexed Shaka Bow G",
  "Heartfelt Cast G",
  "Combat Conga G",
  "Jungle Assault G",
  "Kut-Ku Counteratk G",
  "Kut-Ku Barrage G",
  "Dark Parasol G",
  "Sand Diver",
  "Piercing Crab",
  "Desert Diver",
  "Heavy Piercing Crab",
  "Lunastra's Flames",
  "Hidden Sniper",
  "Great Arbalest+",
  "Tanksorcerer",
  "Bastionwitch",
  "Pressurized Plesioth",
  "Queen Needle",
  "Power Stinger",
  "Violet Punisher",
  "Super Kut-Ku Cannon",
  "Ultra Kut-Ku Cannon",
  "Evil Wind Darkcannon",
  "Meteor Shower",
  "GreatLadybugCannon+",
  "Gaia Eater",
  "Icethrower",
  "Crow Heirloom",
  "Ceanataur Blaster",
  "Terra C Blaster",
  "UltimateLao-ShaoCan",
  "Quick Quiver",
  "Destiny's Arm",
  "Daora's Ceti",
  "Gravios Gigahowl",
  "Gravios Gigaroar",
  "Teostra Flamethrower",
  "Vor Buster",
  "Dark Duelcaster",
  "Tigrex Skull+",
  "AncientDrgnwoodCan",
  "Gaoren Orb",
  "Ukanlos Cannon",
  "Arbalest G",
  "Injector Cannon G",
  "Rapidcaster G",
  "Honeycomber G",
  "Tanksorcerer G",
  "Bastionwitch G",
  "Desert Diver G",
  "PressurizedPlesiothG",
  "Meteor Cannon G",
  "Black Cannon G",
  "Power Stinger G",
  "Queen Needle G",
  "Lunastra's Flames G",
  "SuperKut-KuCannon G",
  "UltraKut-KuCannon G",
  "Crab Buster G",
  "Violet Punisher G",
  "Monodevilcaster G",
  "Duelcaster G",
  "Lao-ShanLungCannon G",
  "Hunter's Bow G",
  "Hunter's Power BowIV",
  "Icicle Bow I",
  "Icicle Bow II",
  "Blango Fur Bow G",
  "Abominable Bow II",
  "Wild Bow G",
  "Wild Power Bow G",
  "Jungle Bow I",
  "Jungle Bow II",
  "Kut-Ku Stave G",
  "Blue Kut-Ku Stave II",
  "BlueKut-KuStave III",
  "Wolf Bow",
  "Crow Bow",
  "Defect Swordfish Bow",
  "Whole Swordfish Bow",
  "PerfectSwordfishBow",
  "Swordfish Bow G",
  "Sonic Bow IV",
  "Sonic Bow G",
  "Daimyo's Warbow G",
  "Grt Purple Emperor I",
  "GrtPurpleEmperor II",
  "Blue Blade Bow I",
  "Blue Blade Bow II",
  "Blue Blade Bow III",
  "Showroom Model",
  "Carmine Bow",
  "Eraser",
  "Tigrex Whisker+",
  "Hidden Bow",
  "Midnight Bow",
  "Black Bow I",
  "Black Bow II",
  "Black Bow G",
  "Exterminator Bow II",
  "Glorious Victory II",
  "Dragon Bow Chaos",
  "Dragon Bow Solar G",
  "AncientDragonwoodBow",
  "Prominence Bow IV",
  "Prominence Bow V",
  "Queen Blaster IV",
  "Queen Blaster V",
  "Heartshot Bow III",
  "Wing Bow I",
  "Wing Bow II",
  "Wing Bow III",
  "Wing Bow IV",
  "Dragonhead Harp II",
  "Dragonhead Harp III",
  "Diablos Horn Bow G",
  "Gale Horn Bow",
  "DiablosKingHornBow",
  "Courageous Dream",
  "Akantor Chaos Bow",
  "Ukanlos Bow",
  "Khezu Bow I",
  "Khezu Bow II",
  "Beast Thunderbow",
  "BeastKingThunderbow",
  "Icy Steel Bow",
  "Daora's Sagittarii",
  "Pirate J Cannon",
  "Diasorte Arrow"
};

// Ancient/Rust Weapons
str AncRustID[10] = {
  "Flat Ruststone (GS/LS)",
  "Ruststone Rod (Lance/GL)",
  "Small Ruststone (SnS/DB)",
  "Large Ruststone (Hammer/HH)",
  "Ancient Flatstone (GS/LS)", 
  "Ancient StoneRod (Lance/GL)",
  "Small Ancient Stone (SnS/DB)",
  "Large Ancient Stone (Hammer/HH)",
  "Ruststone",
  "Ancient Stone"
};

// Skills
str SkillID[101] = {
  "None",
  "Torso Inc",
  "Paralysis",
  "Sleep",
  "Faint",
  "Poison",
  "Antiseptic",
  "Snow Res",
  "Sneak",
  "Health",
  "Rec Speed",
  "Sharpness",
  "Artisan",
  "Fencing",
  "Expert",
  "SwdShrpner",
  "Guard",
  "Guard Up",
  "Auto-Guard",
  "Throw",
  "Reload",
  "Recoil",
  "NormalS Up",
  "PierceS Up",
  "PelletS Up",
  "NormalSAdd",
  "PierceSAdd",
  "PelletSAdd",
  "Crag S Add",
  "ClustS Add",
  "Spc Attack",
  "ElementAtk",
  "BombStrUp",
  "Hunger",
  "Gluttony",
  "Attack",
  "Defense",
  "Protection",
  "HearProtct",
  "Anti-Theft",
  "Wide Area",
  "Backpackng",
  "All Resist",
  "Fire Res",
  "Water Res",
  "Ice Res",
  "ThunderRes",
  "Dragon Res",
  "Heat Res",
  "Cold Res",
  "WindPress",
  "Map",
  "Gathering",
  "HiSpdGathr",
  "Whim",
  "Fate",
  "Fishing",
  "PsychicVis",
  "Recovery",
  "MixSucRate",
  "Shot Mix",
  "Alchemy",
  "Evade",
  "Potential",
  "Everlastng",
  "Stamina",
  "Capacity",
  "Precision",
  "Cooking",
  "Carving",
  "Terrain",
  "Quake Res",
  "BBQ",
  "Gunnery",
  "Horn",
  "Fatigue",
  "Evade Dist",
  "Sword Draw",
  "ComrdGuide",
  "ComradeAtk",
  "ComradeDef",
  "SpeedSetup",
  "PoisonCAdd",
  "ParalyCAdd",
  "SleepCAdd",
  "PowerCAdd",
  "ClsRngCAdd",
  "Guts",
  "Constitutn",
  "Tranquilzr",
  "Perceive",
  "ResistSts",
  "Edgemaster",
  "SteadyHand",
  "Fury",
  "AntiFirDrg",
  "AntiDaora",
  "AntiChamel",
  "ShortCharg",
  "AutoReload"
};

// Skills 2
// str skill[220] {
// "No Skill",
// "Para Duration Halved",
// "Paralysis Negated",
// "Para Duration[\xD72]",
// "Sleep Dur Halved",
// "Sleep Negated",
// "Sleep Dur[\xD72]",
// "Faint Prob Halved",
// "Faint Negated",
// "Faint Duration[\xD72]",
// "Poison Dur Halved",
// "Poison Negated",
// "Poison Dur[\xD72]",
// "Antiseptic",
// "Snow Resistance",
// "Stealth",
// "Taunt",
// "Health +20",
// "Health +30",
// "Health +50",
// "Health -10",
// "Health -20",
// "Health -30",
// "Damage Rec Speed +1",
// "Damage Rec Speed +2",
// "Damage Rec Speed -1",
// "Damage Rec Speed -2",
// "Sharp Sword",
// "Blunt",
// "Sharpness +1",
// "Sharpness -1",
// "ESP",
// "Reckless Abandon+1",
// "Reckless Abandon+2",
// "Reckless Abandon+3",
// "Reckless Abandon-1",
// "Reckless Abandon-2",
// "Reckless Abandon-3",
// "Sharpening Skl Inc",
// "Sharpening Skl Half",
// "Guard +1",
// "Guard +2",
// "Guard -1",
// "Guard -2",
// "Guard Inc",
// "Auto-Guard",
// "Throwing Skill Up",
// "Reloading Speed +1",
// "Reloading Speed +2",
// "Reloading Speed +3",
// "Reloading Speed -1",
// "Reloading Speed -2 ",
// "Reloading Speed -3 ",
// "Recoil Reduction +1",
// "Recoil Reduction +2",
// "NormalS/RapidBow Up",
// "PierceS/PierceBow Up",
// "PelletS/ScattrBow Up",
// "Normal S All LV Add",
// "Pierce S LV1 Add",
// "Pierce S All LV Add",
// "Pellet S LV1 Add",
// "Pellet S All LV Add",
// "Crag S LV1 Add",
// "Crag S All LV Add",
// "Clust S LV1 Add",
// "Clust S All LV Add",
// "Abnormal Sts Atk Up",
// "Element Attack Up",
// "Bomber",
// "Hunger Halved",
// "Hunger Negated",
// "Hunger Increase [Lo]",
// "Hunger Increase [Hi]",
// "Filled Up",
// "Scavenger",
// "Attack Up (Small)",
// "Attack Up (Medium)",
// "Attack Up (Large)",
// "Attack Down (Small)",
// "Attack Down (Medium)",
// "Attack Down (Large)",
// "Defense +20",
// "Defense +30",
// "Defense +40",
// "Defense -20",
// "Defense -30",
// "Defense -40",
// "Divine Protection",
// "Demonic Protection",
// "Earplug",
// "High Grade Earplug",
// "Steal No Effect",
// "Wide Area +1",
// "Wide Area +2",
// "Backpacking Expert",
// "All Res +3",
// "All Res +5",
// "All Res +10",
// "All Res -3",
// "All Res -5",
// "All Res -10",
// "Fire Res +5",
// "Fire Res +10",
// "Fire Res -5",
// "Fire Res -10",
// "Water Res +5",
// "Water Res +10",
// "Water Res -5",
// "Water Res -10",
// "Ice Res +5",
// "Ice Res +10",
// "Ice Res -5",
// "Ice Res -10",
// "Thunder Res +5",
// "Thunder Res +10",
// "Thunder Res -5",
// "Thunder Res -10",
// "Dragon Res +5",
// "Dragon Res +10",
// "Dragon Res -5",
// "Dragon Res -10",
// "Heat Cancel [Lo]",
// "Heat Cancel [Hi]",
// "Heat Inc [Lo]",
// "Heat Inc [Hi]",
// "Cold Elimination[Lo]",
// "Cold Elimination[Hi]",
// "Cold Increase [Lo]",
// "Cold Increase [Hi]",
// "Low Wind Res",
// "High Wind Res",
// "Dragon Wind Breaker",
// "Farsight",
// "Map Unavailable",
// "Gathering +1",
// "Gathering +2",
// "Gathering -1",
// "Gathering -2",
// "High Speed Gathering",
// "Spirit's Whim",
// "Divine Whim",
// "Spectre's Whim",
// "Devil's Whim",
// "Good Luck",
// "Luck Booster",
// "Bad Luck",
// "Calamity",
// "Fishing Expert",
// "Detect",
// "Autotracker",
// "HealthRecItemsImprvd",
// "HealthRecItemsWeaknd",
// "Combine Success +15%",
// "Combine Success +25%",
// "Combine Success +45%",
// "Combine Success -5%",
// "Combine Success -10%",
// "Combine Success -15%",
// "Bullet Limit",
// "Alchemy",
// "Evade +1",
// "Evade +2",
// "Adrenaline +1 ",
// "Adrenaline +2",
// "Worry",
// "Item Usage Improve",
// "Item Usage Decline",
// "Runner",
// "Flat Footed",
// "Capacity Up",
// "Shell Deviation Down",
// "Shell Deviation Up",
// "Quick Eating",
// "Slow Life",
// "Carving Iron Man",
// "Carving Celebrity",
// "TerrainDamageHalf",
// "TerrainDamageNegate",
// "TerrainDamageInc[Lo]",
// "TerrainDamageInc[Hi]",
// "Quake Resistance",
// "BBQ Celebrity",
// "So-Called BBQ King",
// "Gunnery Master",
// "Gunnery King",
// "Flute Expert",
// "Fatigue Cancellation",
// "Evade Distance Up",
// "Art of Unsheathing",
// "Comrade Guidance",
// "ComradGuidance&Trade",
// "Comrade Attack Up",
// "Comrade Defense Up",
// "Trap Master",
// "Poison Coating Add",
// "Paralysis Coat Add",
// "Sleep Coating Add",
// "Power Coating Add",
// "ClsRngCAdd",
// "Guts",
// "Constitution +1",
// "Constitution +2",
// "Constitution -1",
// "Constitution -2",
// "Tranquilizing Whiz",
// "Tranquilizing Celeb",
// "Tranquilizing Guru",
// "Self-Defense",
// "Stellar Hunter",
// "Straight & True",
// "Emboldened",
// "Metallic Protection",
// "Frosty Protection",
// "Fiery Protection",
// "Focus",
// "Distracted",
// "Auto-Reload"
// };

// Bow Charge ID's
str BowChargeID[15] = {
  "RapdLv1",
  "RapdLv2",
  "RapdLv3",
  "RapdLv4",
  "RapdLv5",
  "SctrLv1",
  "SctrLv2",
  "SctrLv3",
  "SctrLv4",
  "SctrLv5",
  "PrceLv1",
  "PrceLv2",
  "PrceLv3",
  "PrceLv4",
  "PrceLv5"
};

`;var xs=`str ItemID[1262] = {
  "\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D\uFF0D",
  "Book of Combos 1",
  "Book of Combos 2",
  "Book of Combos 3",
  "Book of Combos 4",
  "Book of Combos 5",
  "Alchemy Guide",
  "Potion",
  "Mega Potion",
  "Nutrients",
  "Mega Nutrients",
  "Antidote",
  "Immunizer",
  "Power Juice",
  "Mega Juice",
  "Demondrug",
  "Mega Demondrug",
  "Power Pill",
  "Armorskin",
  "Mega Armorskin",
  "Armor Pill",
  "Cool Drink",
  "Hot Drink",
  "Thawing Agent",
  "Psychoserum",
  "Monster Fluid",
  "Monster Broth",
  "Monster Essence",
  "Thunderbug Juice",
  "Thunderbug Jelly",
  "Herbal Medicine",
  "Max Potion",
  "Ancient Potion",
  "Catalyst",
  "Energy Drink",
  "Gunpowder",
  "Lifecrystals",
  "Lifepowder",
  "Powercharm",
  "Powertalon",
  "Armorcharm",
  "Armortalon",
  "Tranquilizer",
  "Raw Meat",
  "Poisoned Meat",
  "Tainted Meat",
  "Drugged Meat",
  "Rare Steak",
  "Well-Done Steak",
  "Gourmet Steak",
  "Burnt Meat",
  "Hot Meat",
  "Cold Meat",
  "Rare Fish",
  "Gourmet Fish",
  "Gourmet Fish+",
  "Burnt Fish",
  "Boomerang",
  "Throwing Knife",
  "Poison Thrw Knf",
  "Sleeping Thr Knf",
  "Paralyze Thr Knf",
  "Tranq Thrwng Knf",
  "Bomb Material",
  "Paintball",
  "Flash Bomb",
  "Sonic Bomb",
  "Dung",
  "Wyvern Droppings",
  "Dung Bomb",
  "Smoke Bomb",
  "Poison Smoke Bmb",
  "Farcaster",
  "Deodorant",
  "Tranq Bomb",
  "Spiderweb",
  "Net",
  "Trap Tool",
  "Pitfall Trap",
  "Shock Trap",
  "Lightning Rod",
  "Barrel Lid",
  "Small Barrel",
  "Large Barrel",
  "Sm Barrel-Bomb",
  "Sm Barrel-Bomb+",
  "Lg Barrel-Bomb",
  "Lg Barrel-Bomb+",
  "Bounce Bomb",
  "Bounce Bomb+",
  "Anti-Dragon Bomb",
  "Polytan Bomb",
  "JUMP Barrel Bomb",
  "Huskberry",
  "Sm Bone Husk",
  "Lg Bone Husk",
  "Normal S Lv1",
  "Normal S Lv2",
  "Normal S Lv3",
  "Pierce S Lv1",
  "Pierce S Lv2",
  "Pierce S Lv3",
  "Pellet S Lv1",
  "Pellet S Lv2",
  "Pellet S Lv3",
  "Crag S Lv1",
  "Crag S Lv2",
  "Crag S Lv3",
  "Clust S Lv1",
  "Clust S Lv2",
  "Clust S Lv3",
  "Flaming S",
  "Water S",
  "Thunder S",
  "Freeze S",
  "Dragon S",
  "Recov S Lv1",
  "Recov S Lv2",
  "Poison S Lv1",
  "Poison S Lv2",
  "Para S Lv1",
  "Para S Lv2",
  "Sleep S Lv1",
  "Sleep S Lv2",
  "Tranq S",
  "Paint S",
  "Demon S",
  "Armor S",
  "No Coating",
  "Empty Bottle",
  "Power Coating",
  "Poison Coating",
  "ParalysisCoating",
  "Sleep Coating",
  "CloseRngCoating",
  "Paint Coating",
  "Cricket",
  "Worm",
  "Firefly",
  "Frog",
  "Tuna Bait",
  "Arrowana Bait",
  "Goldenfish Bait",
  "Mega Fishing Fly",
  "Old Pickaxe",
  "Iron Pickaxe",
  "Mega Pickaxe",
  "Expand Pickaxe",
  "Old Bugnet",
  "Bugnet",
  "Mega Bugnet",
  "BBQ Spit",
  "Gourmet BBQ Spit",
  "Whetstone",
  "Binoculars",
  "Garbage",
  "Flute",
  "Health Flute",
  "Antidote Flute",
  "Demon Flute",
  "Armor Flute",
  "Honey",
  "Sunset Herb",
  "Herb",
  "Antidote Herb",
  "Fire Herb",
  "Ivy",
  "Sleep Herb",
  "Sap Plant",
  "Felvine",
  "Cactus Flower",
  "Hot Pepper",
  "Dosbiscus",
  "Mountain Herbs",
  "Giant Corn",
  "Special Mushroom",
  "Select Mushroom",
  "Blue Mushroom",
  "Nitroshroom",
  "Parashroom",
  "Toadstool",
  "Exciteshroom",
  "Dragon Toadstool",
  "Spicy Mushroom",
  "Chaos Mushroom",
  "Paintberry",
  "Power Seed",
  "Armor Seed",
  "Dragon Seed",
  "Scatternut",
  "Needleberry",
  "Bomberry",
  "Tropical Berry",
  "Frozen Berry",
  "Red Seed",
  "Green Seed",
  "Yellow Seed",
  "Beautiful Shell",
  "Black Pearl",
  "Giant Blk Pearl",
  "Stone",
  "Disk Stone",
  "Iron Ore",
  "Earth Crystal",
  "Machalite Ore",
  "Dragonite Ore",
  "Carbalite Ore",
  "Eltalite Ore",
  "Union Ore",
  "Mellanje Ore",
  "Firestone",
  "Firecell Stone",
  "Coal",
  "Goldstone Piece",
  "Goldstone Hunk",
  "Lightcrystal",
  "Novacrystal",
  "Purecrystal",
  "Antiseptic Stone",
  "Ice Crystal",
  "Rainbow Ore",
  "Great Stone",
  "Armor Stone",
  "Armor Sphere",
  "Armor Sphere+",
  "Hrd Armor Sphere",
  "Hvy Armor Sphere",
  "Ryl Armor Sphere",
  "Tru Armor Sphere",
  "Knife Mackerel",
  "Sushifish",
  "Sleepyfish",
  "Pin Tuna",
  "Rumblefish",
  "Scatterfish",
  "Burst Arrowana",
  "Bomb Arrowana",
  "Glutton Tuna",
  "Gastronome Tuna",
  "Speartuna",
  "Small Goldenfish",
  "Goldenfish",
  "Silverfish",
  "Ancient Fish",
  "Springnight Carp",
  "Tailed Frog",
  "Insect Husk",
  "Yambug",
  "Bughopper",
  "Snakebee Larva",
  "Godbug",
  "Bitterbug",
  "Flashbug",
  "Thunderbug",
  "Carpenterbug",
  "King Scarab",
  "Emperor Cricket",
  "Killer Beetle",
  "Hercudrome",
  "Rare Scarab",
  "PhantomButterfly",
  "Royal Rhino",
  "Divine Rhino",
  "Rainbow Insect",
  "Great Hornfly",
  "Great Ladybug",
  "Screamer",
  "Poison Sac",
  "Toxin Sac",
  "DeadlyPoisonSac",
  "Paralysis Sac",
  "Sleep Sac",
  "Coma Sac",
  "Flame Sac",
  "Inferno Sac",
  "Blazing Fire Sac",
  "Electro Sac",
  "Thunder Sac",
  "Lightning Sac",
  "Power Extract",
  "Pale Extract",
  "Sm Monster Bone",
  "Med Monster Bone",
  "Lg Monster Bone",
  "Monster Bone+",
  "Hrd Monster Bone",
  "Hvy Monster Bone",
  "Eldr Dragon Bone",
  "BigEDragonBone",
  "Mystery Bone",
  "Unknown Skull",
  "Master's Skull",
  "Bone",
  "RobustWyvernBone",
  "Brute Bone",
  "Giant Bone",
  "Stout Bone",
  "Massive Bone",
  "Wyvern Fang",
  "Wyvern Claw ",
  "Wyvern Stone",
  "Big Wyvern Stone",
  "BigEDragonJewel",
  "White Liver",
  "Popo Tongue",
  "Secret Pouch",
  "CarapaceonBrains",
  "CarapaceonBrain+",
  "Piscine Liver",
  "Wyvern Tears",
  "Wyvern Sobs",
  "Territorial Dung",
  "TerritorialDung+",
  "Crab Pearl",
  "Crab Pearl+",
  "Dragon Treasure",
  "Anc Drgn Treasre",
  "Decayed Drgn Scl",
  "Dragon Herb",
  "Felyne Fur Ruby",
  "Mosswine Hide",
  "Bullfango Pelt",
  "ThkBullfangoPelt",
  "Bullfango Head",
  "Bulldrome Tusk",
  "Bulldrome Hide",
  "Bulldrome Hide+",
  "Kelbi Horn",
  "Kelbi Hide",
  "Anteka Antlers",
  "Anteka Pelt",
  "High Qualty Pelt",
  "Remobra Skin",
  "Remobra Skin+",
  "SpecRemobraSkin+",
  "Striped Skin",
  "Remobra Skull",
  "ShakalakaTreasre",
  "ShakalakaTreasr+",
  "ShakaInheritance",
  "Giaprey Scale",
  "Giaprey Scale+",
  "Giaprey Hide",
  "Giaprey Hide+",
  "Giadrome Hide",
  "Giadrome Claw",
  "Giadrome Claw+",
  "Giadrome Skull",
  "Velociprey Fang",
  "Velociprey Scale",
  "Velociprey Scle+",
  "Velociprey Hide",
  "Velociprey Hide+",
  "Velocidrome Hide",
  "Velocidrome Claw",
  "Velocidrome Clw+",
  "Velocidrome Head",
  "Genprey Fang",
  "Genprey Scale",
  "Genprey Scale+",
  "Genprey Hide",
  "Genprey Hide+",
  "Gendrome Hide",
  "Gendrome Tail",
  "Gendrome Skull",
  "Ioprey Fang",
  "Ioprey Scale",
  "Ioprey Scale+",
  "Ioprey Hide",
  "Ioprey Hide+",
  "Iodrome Hide",
  "Iodrome Skull",
  "OrangeHypnoPelt",
  "OrangeHypnoPelt+",
  "Top-GrdHypnoClaw",
  "Hypno Claw+",
  "Hypno Bezoar",
  "Hypno Bezoar+",
  "Hypno Beak",
  "Hypno Fang",
  "RainbowTailFeath",
  "Hypno Ticket",
  "Kut-Ku Scale",
  "Kut-Ku Scale+",
  "Thick Kut-Ku Scl",
  "Kut-Ku Shell",
  "Kut-Ku Carapace",
  "Hvy Kut-Ku Shell",
  "Kut-Ku Ear",
  "Long Kut-Ku Ear",
  "Lucky Kut-Ku Ear",
  "Giant Beak",
  "Splendid Beak",
  "Kut-Ku Webbing",
  "Str Kut-Ku Wing",
  "Blue Kut-Ku Scl",
  "Blue Kut-Ku Scl+",
  "ThkBlueKut-KuScl",
  "Blue Kut-Ku Shl",
  "Blue Kut-Ku Cpc",
  "HvyBlueKut-KuShl",
  "Rubbery Hide",
  "Rubbery Hide+",
  "SpecRubberyHide+",
  "Gypceros Head",
  "HardGypcerosHead",
  "Pur Rubbery Hide",
  "Pur Gypceros Wng",
  "HrdPuGypcerosWng",
  "Garuga Scale",
  "Garuga Scale+",
  "ThickGarugaScale",
  "Garuga Shell",
  "Garuga Carapace",
  "Hvy Garuga Shell",
  "Garuga Ear",
  "Long Garuga Ear",
  "Sharpened Beak",
  "Rejuvenated Beak",
  "Garuga Wing",
  "Str Garuga Wing",
  "Garuga Tail",
  "LethrGarugaTail",
  "Garuga Mane",
  "SilverGarugaPelt",
  "Blango Pelt",
  "Blango Pelt+",
  "Sharp Claw",
  "Piercing Claw",
  "Blangonga Fang",
  "Blangonga Fang+",
  "HvyBlangongaFang",
  "Blangonga Pelt",
  "Blangonga Pelt+",
  "HrdBlangongaPlt+",
  "Blangonga Whiskr",
  "Lthr Pelagus Plt",
  "Blangonga Tail",
  "LeathrBlangoTail",
  "C.BlangongaPelt+",
  "HvyC.BlangoFang",
  "LthrC.BlangoTail",
  "Conga Pelt",
  "Conga Pelt+",
  "Congalala Pelt",
  "Congalala Pelt+",
  "HrdCongalalaPlt+",
  "Vibrant Pelt",
  "Congalala Claw",
  "Congalala Claw+",
  "HrdCongalalaClw+",
  "Congalala Fang",
  "Lg Pelagus Fang",
  "E.CongalalaPelt+",
  "HrdE.CongaClaw",
  "Vibrant Comb",
  "Rajang Horn",
  "Hard Rajang Horn",
  "Rajang Fang",
  "Hvy Rajang Fang",
  "Blk Rajang Pelt",
  "Blk Rajang Pelt+",
  "Rajang Claw",
  "Hard Rajang Claw",
  "Rajang Tail",
  "Dummy",
  "Gold Rajang Pelt",
  "GoldRajangPelt+",
  "Piscine Fang",
  "HvyPiscineFang",
  "Plesioth Scale",
  "Plesioth Scale+",
  "ThckPlesiothScl",
  "Plesioth Fin",
  "Plesioth Fin+",
  "SpecPlesiothFin+",
  "Grn Plesioth Scl",
  "Grn Plsioth Scl+",
  "ThckGrnPlesioScl",
  "Grn Plesioth Fin",
  "Grn Plsioth Fin+",
  "SpecGrnPlesioFn+",
  "Cephalos Scale",
  "Cephalos Scale+",
  "Cephalos Fin",
  "Cephalos Fin+",
  "Coral Cphlos Scl",
  "Coral Cphlos Fin",
  "ThckLavasiothScl",
  "HvyLavasiothShl",
  "HvyLavasiothFang",
  "SpecLavasioFin+",
  "Lavasioth Ticket",
  "Wyvern Skull Shl",
  "Sm Hermitaur Shl",
  "Hermitaur Shell",
  "Hermitaur Carpce",
  "HvyHermitaurShl",
  "Hermitaur Claw",
  "Hermitaur Claw+",
  "HrdHermitaurClaw",
  "PlumD.HermitrShl",
  "PlumD.HermitrClw",
  "Sm Ceanataur Shl",
  "Ceanataur Shell",
  "Ceanataur Carpce",
  "HvyCeanataurShl",
  "Ceanataur Leg",
  "HvyCeanataurLeg",
  "Ceanataur Pincer",
  "Ceanataur Claw",
  "Ceanataur Claw+",
  "HrdCeanataurClaw",
  "TerraCeanatrShl",
  "TerraCeanatrClaw",
  "Sm Lobstershell",
  "Lg Lobstershell",
  "Gt Lobstershell",
  "Amezari Shell",
  "Amezari Carapace",
  "Rathian Scale",
  "Rathian Scale+",
  "ThckRathianScl",
  "Rathian Plate",
  "Rathian Ruby",
  "HvnlyRathianScl",
  "Rathian Shell",
  "Rathian Carapace",
  "HvyRathianShell",
  "Rathian Spike",
  "Rathian Spike+",
  "Rathian Thorn",
  "Pnk Rathian Scl",
  "Pnk Rathian Scl+",
  "ThckPnkRathnScl",
  "Pnk Rathian Shl",
  "Pnk Rathian Cpc",
  "HvyPnkRathianShl",
  "Gld Rathian Scl+",
  "ThckGldRathnScl",
  "Gld Rathian Cpc",
  "HvyGldRathianShl",
  "GoldRathianThorn",
  "Fire Wyvern Claw",
  "HrdFireWyvernClw",
  "FireWyvern Fluid",
  "FireWyvrn Marrow",
  "FireWyvrn BrnStm",
  "Rathalos Scale",
  "Rathalos Scale+",
  "Hrd Rathalos Scl",
  "Rathalos Plate",
  "Rathalos Ruby",
  "HvnlyRathalosScl",
  "Rathalos Shell",
  "Rathalos Carpace",
  "HvyRathalosShl",
  "Rathalos Tail",
  "LthrRathalosTail",
  "Rathalos Webbing",
  "Rathalos Wing",
  "StrRathalosWing",
  "Azure Rthlos Scl",
  "Azre Rthlos Scl+",
  "ThckAzurRthlsScl",
  "Azure Rthlos Shl",
  "Azure Rthlos Cpc",
  "HvyAzurRthlsShl",
  "Azur Rthlos Tail",
  "LthrAzrRthlsTail",
  "Azur Rthlos Wing",
  "Slvr Rthlos Scl+",
  "ThckSlvrRthlsScl",
  "Slvr Rthlos Cpc",
  "HvySlvrRthlsShl",
  "Slvr Rthlos Tail",
  "LthrSlvrRthlsTal",
  "Slvr Rthlos Wing",
  "Flabby Hide",
  "Khezu Hide - Tan",
  "KhezuHide-Cream",
  "Pale Bone",
  "Pale Khezu Steak",
  "KhezuSpecialCut",
  "Alluring Hide",
  "Alluring Webbing",
  "StrAlluringWing",
  "Basarios Shell",
  "Basarios Carpace",
  "HvyBasariosShell",
  "Basarios Wing",
  "StrBasariosWing",
  "Basarios Tears",
  "Tigrex Scale",
  "Tigrex Scale+",
  "ThickTigrexScale",
  "HvnlyTigrexScale",
  "Tigrex Shell",
  "Tigrex Carapace",
  "Hvy Tigrex Shell",
  "Tigrex Tail",
  "LeathrTigrexTail",
  "Tigrex Claw",
  "Tigrex Claw+",
  "Hard Tigrex Claw",
  "Tigrex Fang",
  "Tigrex Fang+",
  "Hvy Tigrex Fang",
  "Tigrex Skull Shl",
  "Narga Scale+",
  "ThickNargaScale",
  "HvnlyNargaScale",
  "Black Narga Pelt",
  "BlackNargaPelt+",
  "Nargacuga Tail",
  "LeatherNargaTail",
  "Narga Tail Spike",
  "HvyNargaTailSpik",
  "NargaCuttingWing",
  "StrNargaCttngWng",
  "Nargacuga Fang+",
  "HvyNargacugaFang",
  "Narga Brain Stem",
  "Gravios Shell",
  "Gravios Carapace",
  "HvyGraviosShell",
  "HvnlyGraviosShl",
  "Gravios Skl Shl",
  "Gravios BrainStm",
  "Blk Gravios Shl",
  "Blk Gravios Cpc",
  "HvyBlkGraviosShl",
  "HvnlyBlkGraviShl",
  "Blk Gravios Skl",
  "Twisted Horn",
  "Majestic Horn",
  "StoutWarpedHorn",
  "Diablos Shell",
  "Diablos Carapace",
  "HvyDiablosShell",
  "Diablos Spine",
  "Diablos Thoracic",
  "HvyDiablosSpine",
  "Diablos Tail",
  "LthrDiablosTail",
  "Blos Fang",
  "TwstBlkBlosHrn",
  "StoutBlkTwstdHrn",
  "Black Blos Shell",
  "Black Blos Cpc",
  "HvyBlkBlosShell",
  "Black Blos Spine",
  "Blk Blos Thracic",
  "HvyBlkBlosSpine",
  "Black Blos Tail",
  "LthrBlkBlosTail",
  "Vespoid Abdomen",
  "VespoidQn'sCrown",
  "Vespoid Shell",
  "Vespoid Carapace",
  "Vespoid Wing",
  "Vespoid InnrWng",
  "Vspoid Razorwing",
  "Hornetaur Shell",
  "Hornetaur Crapce",
  "Hornetaur Head",
  "Hornetaur Wing",
  "HornetaurInnrWng",
  "Hornet Razorwing",
  "Blood Red Horn",
  "Top-GrdRedHorn",
  "Monoblos Shell",
  "MonoblosCarapace",
  "Monoblos Spine",
  "MonoblosThoracic",
  "Monoblos Heart",
  "Wht Monoblos Hrn",
  "Top-GrdPlatHorn",
  "Wht Monoblos Shl",
  "Wht Monoblos Cpc",
  "Wht Monoblos Spn",
  "WhtMonoblosThora",
  "Kirin Horn",
  "Kirin Hide",
  "Kirin Hide+",
  "SpecialKirinHide",
  "Kirin Mane",
  "Platinum Mane",
  "Kirin Thndr Tail",
  "LthrKirinThndrTl",
  "Kirin Azure Horn",
  "Lao-Shan's Claw",
  "Lao-Shan's Horn",
  "Lao-Shan's Scale",
  "Lao-Shan Scale+",
  "Lao-Shan'sThkScl",
  "Lao-Shan's Ruby",
  "Lao-ShanHvnlyScl",
  "Lao-Shan's Shell",
  "Lao-ShanCarapace",
  "Lao-Shan'sHvyShl",
  "Azure LaoS Horn",
  "Azure LaoS Shell",
  "Azure LaoS Claw",
  "Gaoren Shell",
  "Gaoren Carapace",
  "HvyGaorenShell",
  "HvnlyGaorenShell",
  "Gaoren Spine",
  "Gaoren Thoracic",
  "Hvy Gaoren Spine",
  "Gaoren Pincer",
  "Gaoren Claw",
  "Hard Gaoren Claw",
  "Daora Shell",
  "Daora Carapace",
  "Hvy Daora Shell",
  "DaoraDragonScale",
  "DaoraDragonScal+",
  "ThckDaoraDrgnScl",
  "Daora Webbing",
  "Str Daora Wing",
  "Daora Horn",
  "Hard Daora Horn",
  "Daora Tail",
  "Lthr Daora Tail",
  "Daora Claw",
  "Daora Sharp Claw",
  "Daora Jewel",
  "Chameleos Hide",
  "Chameleos Hide+",
  "SpecChameleHide+",
  "Chameleos Horn",
  "Chameleos Spike",
  "HrdChameleosHorn",
  "Chameleos Claw",
  "ChameleosWebbing",
  "StrChameleosWing",
  "Chameleos Tail",
  "LthrChameleoTail",
  "Chameleos Jewel",
  "Fire Dragon Scl",
  "Fire Drgn Scl+",
  "ThckFireDrgnScl",
  "Fire Dragon Claw",
  "HrdFireDrgnClaw",
  "Fire Drgn Webbng",
  "Fire Dragon Pwdr",
  "Fire Drgn Jwl",
  "ElderDragonBlood",
  "Lunastra Shell",
  "LunastraCarapace",
  "Lunastra Mane",
  "Lunastra Tail",
  "Lunastra Horn",
  "Lunastra Spike",
  "Teostra Shell",
  "Teostra Carapace",
  "HvyTeostraShell",
  "Teostra Mane",
  "Teostra Tail",
  "LthrTeostraTail",
  "Teostra Horn",
  "Teostra Horn+",
  "HardTeostraHorn",
  "Dragonmoss",
  "Dragonmoss+",
  "AncientDrgnmoss",
  "Dragonwood",
  "Dragonwood+",
  "AncientDrgnwood",
  "YamaTsukamiHide",
  "YamaTsukaFillet",
  "YamaTsukamiFluid",
  "Dark Piece",
  "Dark Stone",
  "Fatalis Horn",
  "HardFatalisHorn",
  "Fatalis Scale",
  "ThckFatalisScale",
  "Fatalis Shell",
  "Hvy Fatalis Shl",
  "Fatalis Eye",
  "Fatalis Evil Eye",
  "Fatalis Webbing",
  "Str Fatalis Wng",
  "Fatalis CrmsnHrn",
  "HrdFatlisCrmHorn",
  "Fatalis CrmsnScl",
  "ThckFatlisCrmScl",
  "Fatalis CrmsnShl",
  "HvyFatalisCrmShl",
  "Fatalis DevilEye",
  "Fatalis CrmsnWng",
  "StrFatlisCrmWing",
  "Wht Fatalis Scl",
  "ThckWhtFatlisScl",
  "Wht Fatalis Shl",
  "HvyWhtFatalisShl",
  "Wht Fatalis Wbng",
  "StrWhtFatalisWng",
  "Wht Fatalis Horn",
  "HrdWhtFatlisHorn",
  "Akantor Scale",
  "Akantor Shell",
  "Akantor Tail",
  "Akantor Claw",
  "Akantor Fang",
  "Akantor Spike",
  "HvyUkanlosShell",
  "UkanlosUnderscl",
  "Hvy Ukanlos Tail",
  "UkanlosDiggngClw",
  "UkanlosShovelJaw",
  "StrongUkanlosFin",
  "Ukanlos Stone",
  "Wyverian Harp",
  "Sinister Cloth",
  "Lost Umbrella",
  "Ruststone",
  "Flat Ruststone",
  "Large Ruststone",
  "Small Ruststone",
  "Ruststone Rod",
  "Ancient Stone",
  "AncientFlatstone",
  "Lg Ancient Stone",
  "Sm Ancient Stone",
  "Ancient StoneRod",
  "Organizer Guide",
  "Backpacker Guide",
  "Lynian Info",
  "Shakalaka Info",
  "Neopteron Info",
  "GrtThundrbugInfo",
  "Herbivore Info",
  "Bird Wyvern Info",
  "HypnocatriceInfo",
  "Yian Garuga Info",
  "FlyingWyvernInfo",
  "Remobra Info",
  "Tigrex Info",
  "Nargacuga Info",
  "Akantor Info",
  "Ukanlos Info",
  "Piscine Info",
  "Lavasioth Info",
  "Carapaceon Info1",
  "Carapaceon Info2",
  "Shen Gaoren Info",
  "Pelagus Info",
  "Rajang Info",
  "Kirin Info",
  "KushalaDaoraInfo",
  "Chameleos Info",
  "Lunastra Info",
  "Teostra Info",
  "Lao-Shan Info",
  "YamaTsukamiInfo",
  "Fatalis Info",
  "Steel Egg",
  "Silver Egg",
  "Golden Egg",
  "Map",
  "First-Aid Med",
  "Ration",
  "Portable Spit",
  "Mini Whetstone",
  "Prtbl Shock Trap",
  "Supply Flash Bmb",
  "Sply Max Potion",
  "Sply Pitfall Trp",
  "Sply Lg Brrl Bmb",
  "Ballista S",
  "Cannon S",
  "Wyvern",
  "Wyvern Egg",
  "Herbivore Egg",
  "Carnivore Egg",
  "Sootstone Ore",
  "Quartz Ore",
  "Powderstone",
  "Khezu Whelp",
  "Khz Whlp Ice Crm",
  "Kut-Ku Coin",
  "Congalala Coin",
  "Khezu Coin",
  "Daimyo Coin",
  "Blangonga Coin",
  "Yian Garuga Coin",
  "Tigrex Coin",
  "Diablos Coin",
  "Gravios Coin",
  "Kirin Coin",
  "Cephadrome Coin",
  "Plesioth Coin",
  "Shogun Coin",
  "Fire Coin",
  "Rajang Coin",
  "BlackBeltCoinG",
  "Expert Coin G",
  "Warrior Coin G",
  "Legend Coin G",
  "Commendation",
  "Commendation G",
  "Commendation S",
  "Pawprint Stamp",
  "Pokke Ticket",
  "Pokke Ticket+",
  "Normal Ticket",
  "Hard Ticket",
  "Plus Class Tcket",
  "Hero of Kkto Bio",
  "Hero of JumboBio",
  "Elder Thank You",
  "Elder Thnk You+",
  "FlynMealPassReg",
  "FlynMealPassPlus",
  "Comrade Ticket",
  "VeggieElderTcket",
  "VeggieElderTckt+",
  "VegElderTcktBrz",
  "VegElderTcktSlv",
  "VegElderTcktGld",
  "VegElderTcktSky",
  "Blackbelt Ticket",
  "Expert Ticket",
  "Paw Pass Ticket",
  "Limited Paw Pass",
  "Famitsu Ticket",
  "Famitsu Invoice",
  "Famitsu PT Tckt",
  "FamitsuCustomTkt",
  "Dengeki Ticket",
  "Dengeki G Ticket",
  "Dengeki 2G Tckt",
  "Dengeki Maoh Tkt",
  "Pirate J Ticket",
  "Pirate J Tckt G",
  "Magazine Ticket",
  "Hunter's Ticket",
  "Hunter Soul Tkt",
  "Puppet Ticket",
  "SpecPuppetTicket",
  "Suiko Jewel",
  "Akito Jewel",
  "BattlefieldJewel",
  "LapisLazuliJewel",
  "Paralysis Jewel",
  "Paralysis Jewel+",
  "Pep Jewel",
  "Jolt Jewel",
  "Steadfast Jewel",
  "Steadfast Jewel+",
  "Antidote Jewel",
  "Antidote Jewel+",
  "Retroviral Jewel",
  "Antiviral Jewel",
  "Snowblower Jewel",
  "SnowblowerJewel+",
  "Tip Toe Jewel",
  "Ninja Jewel",
  "Strength Jewel",
  "Feel Good Jewel",
  "Razor Jewel",
  "Artisan Jewel",
  "Fencer Jewel",
  "Expert Jewel",
  "Grinder Jewel",
  "Stone Wall Jewel",
  "Hard Wall Jewel",
  "HvnlyShieldJewel",
  "Hardball Jewel",
  "Early Bird Jewel",
  "Recoilless Jewel",
  "StrongShot Jewel",
  "Pierce Jewel",
  "Pellet Jewel",
  "Shot Bonus Jewel",
  "PierceBonusJewel",
  "PelletBonusJewel",
  "Crag Bonus Jewel",
  "ScattrBonusJewel",
  "SpecialAtk Jewel",
  "Element Jewel",
  "Bombardier Jewel",
  "PickyEater Jewel",
  "No Food Jewel",
  "Fatso Jewel",
  "Attack Jewel",
  "Defense Jewel",
  "Protection Jewel",
  "DivineProtectJwl",
  "Earplug Jewel",
  "Alarm Jewel",
  "Friendship Jewel",
  "Backpacker Jewel",
  "Impervious Jewel",
  "Inferno Jewel",
  "Crimson Jewel",
  "Stream Jewel",
  "Torrent Jewel",
  "Freeze Jewel",
  "Glacier Jewel",
  "Lightning Jewel",
  "Thunder Jewel",
  "Slayer Jewel",
  "DragonslyrJewel",
  "CoolBreeze Jewel",
  "ColdBreezeJewel",
  "WarmBreeze Jewel",
  "HotBreezeJewel",
  "PaperweightJewel",
  "Map Jewel",
  "Gathering Jewel",
  "Grab'n'DashJewel",
  "Good Luck Jewel",
  "Blessing Jewel",
  "Fate Jewel",
  "Fisher Jewel",
  "Psychic Jewel",
  "Curing Jewel",
  "Professor Jewel",
  "Armory Jewel",
  "SecretArts Jewel",
  "Evade Jewel",
  "Danger Jewel",
  "StayingPwr Jewel",
  "Marathon Jewel",
  "Ammo Box Jewel",
  "Sniper Jewel",
  "SharpshootrJewel",
  "QuickEaterJewel",
  "HideCutter Jewel",
  "Melt-Proof Jewel",
  "Anchor Jewel",
  "BBQ Jewel",
  "Small Arms Jewel",
  "Howitzer Jewel",
  "Fife Jewel",
  "Tireless Jewel",
  "Jumping Jewel",
  "Sword Draw Jewel",
  "Cat Guide Jewel",
  "Cat Attack Jewel",
  "CatDefenseJewel",
  "TrapMasterJewel",
  "PoisonCoatJewel",
  "ParalysCoatJewel",
  "Sleep Coat Jewel",
  "Power Coat Jewel",
  "Combo Coat Jewel",
  "Guts Jewel",
  "ConstitutnJewel",
  "Tranq Jewel",
  "Perceive Jewel",
  "ShortChargeJewel",
  "Cont. Fire Jewel",
  "AntiParalyzJewel",
  "Anti-Faint Jewel",
  "Antivenin Jewel",
  "Snowplow Jewel",
  "SpeedyRecvrJewel",
  "Celebrity Jewel",
  "IronCurtainJewel",
  "Wall Jewel",
  "High Speed Jewel",
  "SpecialAtkJewel+",
  "Fasting Jewel",
  "Fierce Jewel",
  "Turtle Jewel",
  "Beloved Jewel",
  "Omnipotent Jewel",
  "Extinction Jewel",
  "Cold Wind Jewel",
  "Hot Wind Jewel",
  "HeavyMetal Jewel",
  "Destiny Jewel",
  "Cure All Jewel",
  "Cure All Jewel+",
  "Dodge Jewel",
  "Pinch Jewel",
  "Permanence Jewel",
  "Eternal Jewel",
  "Fast Food Jewel",
  "Anti-Thaw Jewel",
  "Tectonic Jewel",
  "UnsheathingJewel",
  "ParalysisCAddJwl",
  "PowerCAddJewel",
  "More Guts Jewel",
  "Health Jewel",
  "Knockout Jewel",
  "Cutter Jewel",
  "Master Jewel",
  "Swordsman Jewel",
  "Hermit Jewel",
  "StrongWall Jewel",
  "Shockless Jewel",
  "StrongShotJewel+",
  "Pierce Jewel+",
  "Pellet Jewel+",
  "Element Jewel+",
  "Strongest Jewel",
  "Silencer Jewel",
  "Tenderness Jewel",
  "TrueResistJewel",
  "Solid Rock Jewel",
  "Crisis Jewel",
  "Sprinter Jewel",
  "Magazine Jewel",
  "Scarfing Jewel",
  "Carving Jewel",
  "Flying Jewel",
  "RapidChargeJewel",
  "Barrage Jewel",
  "Giadrome Jewel",
  "Kut-Ku Jewel",
  "Daimyo Jewel",
  "Congalala Jewel",
  "Rathalos Jewel",
  "Gravios Jewel",
  "Garuga Jewel",
  "Eldr Drgn Tears",
  "Lao-Shan Melon",
  "Eldr Drgn Fossil",
  "Gypceros Crystal",
  "Rathian Jewel",
  "Teostra Meteor",
  "ThsandYearForest",
  "Frozen Meatball",
  "Buckshot Acorn",
  "Cephadrome Melon",
  "Golden Cocoon",
  "Amber Egg",
  "Graviscus Bulb",
  "Century Walnut",
  "Hard Dragonrock",
  "Dragonrock+",
  "Dragonrock",
  "Green Fin",
  "Kut-Ku Cartilage",
  "Hermitaur Brains",
  "Congalala Stomch",
  "Rathalos Liver",
  "Gravios Giblets",
  "Garuga Drumstick",
  "Giadrome Thigh",
  "Kut-Ku Gizzards",
  "Daimyo Legs",
  "Congalala Innrds",
  "Rathalos Tongue",
  "Gravios Wingtip",
  "GarugaClavclMeat",
  "Blango Bacon",
  "Kut-Ku Skin",
  "Cephalos Roe",
  "Twstd Bldrm Tsk",
  "Rathian Chops",
  "Purple Crest",
  "GarugaWhiteLiver",
  "Dragonite (L)",
  "Dragonite (M)",
  "Dragonite (S)",
  "Pokke Snowman",
  "Felyne Crown",
  "GldFlynJewelSwd",
  "Dynasty Vase",
  "Mysterious Mask",
  "Eldr Drgn Rfrnc",
  "AncntCatKingStat",
  "Blngo Blzrd Ball",
  "Blngo Flrry Ball",
  "Inferior FlynCrn",
  "Flyn Crwn Frgmnt",
  "Hndlelss Gld Bld",
  "GldBladelessHndl",
  "Bttmlss Old Vase",
  "Old Vase Bottom",
  "Holed Shaka Mask",
  "Shakalaka Stone",
  "Torn Old Book",
  "Old Book Scrap",
  "TaillessCatStatu",
  "BrokenStoneTail",
  "Popo Dandelion",
  "Velociprey Lily",
  "Monoblos Rose",
  "Chameleos' Purse",
  "Peach Clover",
  "Gravibiscus",
  "Shakalaka Ranka",
  "Wyvern Grass",
  "Glitter Mushroom",
  "Shining Jellyfsh",
  "Bright Mushroom",
  "Glittr Capshroom",
  "Skin Care Shroom",
  "Beauty Shroom",
  "ShimmeringShroom",
  "Wyvernshroom",
  "Blangonga Apple",
  "Kelbi Nuts",
  "Cephalos Wtrmeln",
  "Khezu Seed",
  "Writhe Nut",
  "Basarios Peach",
  "Shakalaka Squash",
  "Lady Mackerel",
  "Angler Snapper",
  "Yokotuna",
  "Nobunaga Bonito",
  "Goldendrome",
  "Amateratuna",
  "Brilliant Aji",
  "Chuck Mackerel",
  "Victory Fish",
  "Plump Goldenfish",
  "Hideyoshi Ambrjk",
  "Silverdrome",
  "Susanofish",
  "Pharr Yellowtail",
  "Large Wyvernfish",
  "Med Wyvernfish",
  "Small Wyvernfish",
  "Pickaxe Fish",
  "Bugnet Fish",
  "Cooler Fish",
  "Pokke Quartz",
  "Telos Stone",
  "Sekumaeya Pearl",
  "Schradite",
  "Minegarde Night",
  "Lateobrium",
  "Mezeporter Topaz",
  "Furiamond",
  "Jumboite",
  "Dragokurium",
  "Liber Ruby",
  "Kokotoite",
  "Dondorumin",
  "GrtForestCrystal",
  "Wyvern Ore",
  "Pure Wyvern Ore",
  "Pillow Bug",
  "Cleopatris",
  "GiantStagBeetle",
  "Ghostly Cicada",
  "Celeb Cicada",
  "Athena Beetle",
  "Hornfly Princess",
  "Princess Scarab",
  "Marilyn Btterfly",
  "Cricket of Troy",
  "Cutie Crawler",
  "Lovely Locust",
  "Killer Venus",
  "Hornfly Prince",
  "Rathian Fly",
  "Rathalos Fly",
  "Embroidered Flag"
};`;var vs=`str emID[90] = {
  "None",
  "Rathian",
  "Fatalis",
  "Kelbi",
  "Mosswine",
  "Bullfango",
  "Yian Kut-Ku",
  "Lao-Shan Lung",
  "Cephadrome",
  "Felyne",
  "Veggie Elder",
  "Rathalos",
  "Aptonoth",
  "Genprey",
  "Diablos",
  "Khezu",
  "Velociprey",
  "Gravios",
  "Cat Cart",
  "Vespoid",
  "Gypceros",
  "Plesioth",
  "Basarios",
  "Melynx",
  "Hornetaur",
  "Apceros",
  "Monoblos",
  "Velocidrome",
  "Gendrome",
  "Rocks",
  "Ioprey",
  "Iodrome",
  "Poogie",
  "Kirin",
  "Cephalos",
  "Giaprey",
  "Crimson Fatalis",
  "Pink Rathian",
  "Blue Yian Kut-Ku",
  "Purple Gypceros",
  "One-Ear Yian Garuga",
  "Silver Rathalos",
  "Gold Rathian",
  "Black Diablos",
  "White Monoblos",
  "Red Khezu",
  "Green Plesioth",
  "Black Gravios",
  "Daimyo Hermitaur",
  "Azure Rathalos",
  "Ashen Lao-Shan Lung",
  "Blangonga",
  "Congalala",
  "Rajang",
  "Kushala Daora",
  "Shen Gaoren",
  "Great Thunderbug",
  "Shakalaka",
  "Yama Tsukami",
  "Chameleos",
  "Rusted Kushala Daora",
  "Blango",
  "Conga",
  "Remobra",
  "Lunastra",
  "Teostra",
  "Hermitaur",
  "Shogun Ceanataur",
  "Bulldrome",
  "Anteka",
  "Popo",
  "White Fatalis",
  "Yama Tsukami",
  "Ceanataur",
  "Miner Wyverian",
  "Tigrex",
  "Akantor",
  "Giadrome",
  "Yian Garuga",
  "King Shakalaka",
  "Vespoid Queen",
  "Nargacuga",
  "Hypnocatrice",
  "Lavasioth",
  "Copper Blangonga",
  "Emerald Congalala",
  "Plum Daimyo Hermitaur",
  "Terra Shogun Ceanatur",
  "Ukanlos",
  "Furious Rajang"
};`;var Rt={"fuctool/filelist.csv":Ss,"includes/equip.enum":ks,"includes/items.enum":xs,"includes/monster.enum":vs};function Mt(a){let e=a.replace(/\\/g,"/");for(let[r,s]of Object.entries(Rt))if(e.endsWith(r))return s}function Ae(a){let e=Mt(String(a));if(e===void 0)throw new Error(`No file system in the browser (${a})`);return e}f();function pe(a){return new URL(String(a)).pathname}var Bs={_comment:["EU (ULES01213) DATA.BIN index -> JP filelist.csv index, for the 6657-entry EU TOC.","Derived by aligning a real EU dump against vendor/fuctool/filelist.csv by file type","(PMO/TMH/.pac/.ovl/PSMF/RIFF magics, .phd 'Head' vs .bd zero-filled headers); every","mapped entry's type matches. Entries in no segment exist only on the EU disc and keep","the _unindexed/<index>.bin name. JP module/libfont.prx and module/libbase64.prx have","no EU counterpart.","Confidence: the segments from EU 44 on (player, weapon, sound, quest, stage, emmodel","groups) have unambiguous boundaries. Placement of EU-only entries among EU 0-43","(system/icon/message files) is a best fit, not verified."],totalEntries:6657,segments:[{eu:0,jp:0,count:12},{eu:16,jp:12,count:3},{eu:23,jp:15,count:1},{eu:33,jp:16,count:5},{eu:41,jp:21,count:1},{eu:44,jp:24,count:4732},{eu:4788,jp:4756,count:567},{eu:5359,jp:5323,count:28},{eu:5403,jp:5351,count:974},{eu:6380,jp:6325,count:277}]};var It=N.join(N.dirname(pe("file:///randomfu/bundle.js")),"..","..","vendor","fuctool","filelist.csv"),sr=null,Es=new Map;function Xe(a="jp"){if(a!=="eu")return Gs();let e=Es.get(a);if(e)return e;let r=Gs(),s=Bs,n=new Map;for(let o of s.segments)for(let t=0;t<o.count;t++){let i=r.get(o.jp+t);i!==void 0&&n.set(o.eu+t,i)}return Es.set(a,n),n}function Gs(){if(sr)return sr;let a=Ae(It,"utf-8"),e=new Map;for(let r of a.split(`
`)){let s=r.trim();if(!s)continue;let n=s.indexOf(",");if(n===-1)continue;let o=Number.parseInt(s.slice(0,n),10),t=s.slice(n+1);Number.isNaN(o)||e.set(o,t)}return sr=e,e}function Ts(a="jp"){let e=Xe(a),r=[];for(let[s,n]of e)n.startsWith("mission_jpn/")&&n.endsWith(".mib")&&r.push(s);return r.sort((s,n)=>s-n)}f();f();var F=class{constructor(e){this.buf=e}get length(){return this.buf.length}assertInBounds(e,r,s){if(e<0||e+r>this.buf.length)throw new RangeError(`${s} out of bounds: offset=0x${e.toString(16)} size=${r} bufLength=0x${this.buf.length.toString(16)}`)}u8(e){return this.assertInBounds(e,1,"u8"),this.buf.readUInt8(e)}s8(e){return this.assertInBounds(e,1,"s8"),this.buf.readInt8(e)}u16(e){return this.assertInBounds(e,2,"u16"),this.buf.readUInt16LE(e)}s16(e){return this.assertInBounds(e,2,"s16"),this.buf.readInt16LE(e)}u32(e){return this.assertInBounds(e,4,"u32"),this.buf.readUInt32LE(e)}s32(e){return this.assertInBounds(e,4,"s32"),this.buf.readInt32LE(e)}f32(e){return this.assertInBounds(e,4,"f32"),this.buf.readFloatLE(e)}bytes(e,r){return this.assertInBounds(e,r,"bytes"),this.buf.subarray(e,e+r)}fixedString(e,r){let s=this.bytes(e,r),n=s.indexOf(0);return s.toString("latin1",0,n===-1?s.length:n)}cString(e,r=4096,s="latin1"){let n=e,o=Math.min(this.buf.length,e+r);for(;n<o&&this.buf[n]!==0;)n++;return this.buf.toString(s,e,n)}magic(e,r){return this.bytes(e,r)}};function nr(a,e){return a-e}function Cs(a,e,r){return nr(a.u32(e),r)}var Ht=Buffer.from("MWo3","latin1"),Rs=32,Ms=96,Dt=Rs+Ms,or=class extends Error{},tr=class{reader;loadBase;loadEnd;name;constructor(e){let r=new F(e),s=r.magic(0,4);if(!s.equals(Ht))throw new or(`Not an MWo3 overlay (expected magic "MWo3", got ${s.toString("hex")})`);this.reader=r,this.loadBase=r.u32(8),this.loadEnd=r.u32(28),this.name=r.fixedString(Rs,Ms)}vaddrToOffset(e){return nr(e,this.loadBase)}isOwnVaddr(e){let r=this.vaddrToOffset(e);return r>=Dt&&r<this.reader.length}};function As(a){return new tr(a)}f();f();var Lt={signature:Buffer.from("e00100007800000008020000e60000008c000000780000008c000000e001000008020000e600000078000000","hex"),signatureOffset:0},Pt={signature:Buffer.from("0000000104ff000000000000000000000000000000000100","hex"),signatureOffset:0},Ft={signature:Buffer.from("0000000000000000000000000000000000000000000000000a00050050c300000002be00000000000000000000410000","hex"),signatureOffset:0},Ut={signature:Buffer.from("0b0000000000000000000000000000000000000200000000ffffffff","hex"),signatureOffset:0},jt={signature:Buffer.from("010f0000000000000000000000000000","hex"),signatureOffset:0},Ot={signature:Buffer.from("50006e00dc0040017c01ae01c201","hex"),signatureOffset:0},Kt={signature:Buffer.from("07000302020003040000000500010007","hex"),signatureOffset:0},Nt={signature:Buffer.from("0101fc004a010100000000000000000000000000000000000000","hex"),signatureOffset:0},Vt={signature:Buffer.from("ff0000000000000000000000000000000000000000000000ff00000000000000000000000000000000000000000000000000000000000000","hex"),signatureOffset:0},zt={signature:Buffer.from("0606090303030404040101010101010303030301030303010301030102020101","hex"),signatureOffset:0},Wt={signature:Buffer.from("0000010600010206","hex"),signatureOffset:0},$t={signature:Buffer.from("630380000c000200080064038000100002001400","hex"),signatureOffset:0},qt={signature:Buffer.from("00000363002b040000000000900100002800000000000200","hex"),signatureOffset:0},Xt={signature:Buffer.from("000000003333333f3333b33f000000409a9989403d0ab73f","hex"),signatureOffset:0},Jt={weaponClassModifiers:Lt,itemTable:Pt,weaponsBlademaster:Ft,weaponsGunner:Ut,decorationSkills:jt,sharpnessTable:Ot,modelToWeaponType:Kt,equipmentCreate:Nt,equipmentUpgrade:Vt,bowgunShotTable:zt,bowChargeTable:Wt,dualAttributeWeapons:$t,decorationValues:qt,bowgunModTable:Xt},Zt={armorValuesHead:{signature:Buffer.from("000000000f00000000000000000000000000000000000000000000000000000000000000000000000f0011000f0000002c0100000202000000000100060b0e0e13131c0002003402130229013c0244fe","hex"),signatureOffset:0},armorValuesChest:{signature:Buffer.from("000000000f0000000000000000000000000000000000000000000000000000000000000000000000060024000f0000002c0100000202000000000000060b0e0e13131c0002003402130229023b0244ff","hex"),signatureOffset:0},armorValuesArm:{signature:Buffer.from("000000000f0000000000000000000000000000000000000000000000000000000000000000000000060023000f0000002c0100000202000000000100060b0e0e13131c0002003403130229023d020000","hex"),signatureOffset:0},armorValuesWaist:{signature:Buffer.from("000000000f0000000000000000000000000000000000000000000000000000000000000000000000060019000f0000002c0100000202000000000000060b0e0e13131c0003003403130229013b0344fe","hex"),signatureOffset:0},armorValuesLeg:{signature:Buffer.from("000000000f000000000000000000000000000000000000000000000000000000000000000000000006001a000f0000002c0100000202000000000100060b0e0e13131c0002003403130229023d020000","hex"),signatureOffset:0}},Is={...Jt,...Zt};f();f();var ie=class extends Error{},Ie=class{constructor(e,r){this.baseAddress=e;this.tableAddresses=r}resolve(e){let r=this.tableAddresses[e];if(r===void 0)throw new ie(`StaticOffsetResolver: no known address for table "${e}"`);return r-this.baseAddress}},ba=class{constructor(e,r){this.inner=e;this.original=r}offsets=new Map;resolve(e){let r=this.offsets.get(e);return r===void 0&&(r=this.inner.resolve(e,this.original),this.offsets.set(e,r)),r}};function Qt(a,e){if(e.length===0)throw new ie("findAllOccurrences: needle must not be empty (every offset would trivially match)");let r=[],s=0;for(;;){let n=a.indexOf(e,s);if(n===-1)break;r.push(n),s=n+1}return r}var ga=class{constructor(e){this.signatures=e}resolve(e,r){let s=this.signatures[e];if(!s)throw new ie(`SignatureResolver: no signature registered for table "${e}" \u2014 this table hasn't been validated for this region yet`);if(!r)throw new ie(`SignatureResolver: resolving table "${e}" requires a buffer to search`);let n=Qt(r,s.signature);if(n.length===0)throw new ie(`SignatureResolver: signature for table "${e}" not found in buffer (0 matches) \u2014 wrong region/game, or the EBOOT doesn't look like expected`);if(n.length>1)throw new ie(`SignatureResolver: signature for table "${e}" is ambiguous (${n.length} matches at ${n.slice(0,5).map(o=>`0x${o.toString(16)}`).join(", ")}${n.length>5?", ...":""}) \u2014 signature needs to be longer/more specific`);return n[0]-s.signatureOffset}};var He=142613068,De={weaponClassModifiers:143884548,equipmentCreate:143887636,equipmentUpgrade:143969956,armorValuePointers:144136560,weaponsBlademaster:144012488,weaponsGunner:144040088,decorationSkills:144133856,modelToWeaponType:144136580,bowgunShotTable:144137204,bowChargeTable:144139060,sharpnessTable:144139528,bowgunModTable:144140612,dualAttributeWeapons:144141396,decorationValues:144309016,itemTable:144286264},T={weaponsBlademaster:1150,weaponsGunner:354,headArmor:436,chestArmor:420,armArmor:411,waistArmor:409,legArmor:420,sharpnessEntries:40,decorations:169,regularItems:948,modelToWeaponType:553,dualAttributeWeapons:15},Le=24,Pe=28,Je=40,q=24,pr=16,_a=14,X=26,J=28,Hs=10,Yt=new Ie(He,De);function ir(a){return Yt.resolve(a)}function U(a,e,r){return r?r.resolve(a,e.buf):ir(a)}f();f();var Gm=T.sharpnessEntries*_a;var Ds=58,Ls=32,Ps=117,Fs=4;var ep={weaponClassModifiers:{entrySize:4,count:11},armorValuePointers:{entrySize:4,count:5},weaponsBlademaster:{entrySize:Le,count:T.weaponsBlademaster},weaponsGunner:{entrySize:Pe,count:T.weaponsGunner},decorationSkills:{entrySize:pr,count:T.decorations},modelToWeaponType:{entrySize:1,count:T.modelToWeaponType},sharpnessTable:{entrySize:_a,count:T.sharpnessEntries},bowgunShotTable:{entrySize:Ls,count:Ds},bowChargeTable:{entrySize:Fs,count:Ps},dualAttributeWeapons:{entrySize:Hs,count:T.dualAttributeWeapons},decorationValues:{entrySize:q,count:T.decorations},itemTable:{entrySize:q,count:T.regularItems}},ap={equipmentCreate:X,equipmentUpgrade:J},rp=Object.keys(De).map(a=>{let e=a,r=ep[e];if(r)return{name:a,entrySize:r.entrySize,count:r.count};let s=ap[e];return s!==void 0?{name:a,entrySize:s}:{name:a}}),sp=new Ie(He,De),np=new ga(Is);var Us={id:"mhp2g",tables:rp,resolverForRegion(a){switch(a){case"jp":return sp;case"eu":return np;case"us":return null}}};f();f();var js=[65437,65449,65479,65521],op=[5897,15859,29819,45953],tp={jp:"37wyS2Jfc3x5w9oG",us:"Vd6gh8F30wA86Ex5",eu:"Vd6gh8F30wA86Ex5"},Km=Buffer.from([76,0,0,0,50,78,68,71]),le=class extends Error{};function lr(a,e){return Te("sha1").update(Buffer.concat([a,Buffer.from(tp[e],"ascii")])).digest()}var wa=class{key;constructor(e){this.key=[0,1,2,3].map(r=>e[r]===0?js[r]:e[r])}next(e){let r=e%4,s=this.key[r]*op[r]%js[r];return this.key[r]=s,s}};function mr(a){if(a.length<8||a.length%2!==0)throw new le(`quest block must be an even length of at least 8 bytes, got ${a.length}`);let e=[a.readUInt16LE(0),a.readUInt16LE(2),a.readUInt16LE(4),a.readUInt16LE(6)],r=new wa(e),s=Buffer.alloc(a.length-8);for(let n=0;n<s.length;n+=2)s.writeUInt16LE(a.readUInt16LE(8+n)^r.next(n/2),n);return s}function Os(a,e){if(a.length%2!==0)throw new le(`quest body must be an even length, got ${a.length}`);let r=new wa(e),s=Buffer.alloc(8+a.length);s.writeUInt16LE(e[0],0),s.writeUInt16LE(e[1],2),s.writeUInt16LE(e[2],4),s.writeUInt16LE(e[3],6);for(let n=0;n<a.length;n+=2)s.writeUInt16LE(a.readUInt16LE(n)^r.next(n/2),8+n);return s}function cr(a,e){let r=mr(a);if(r.length<24)throw new le(`decrypted quest block too short for its header (${r.length} bytes)`);let s=r.readUInt32LE(0),n=r.subarray(4,24),o=r.subarray(24);if(s>o.length)throw new le(`quest header declares size ${s}, but only ${o.length} bytes follow \u2014 wrong region/offset or corrupt data`);let t=o.subarray(0,s);if(!lr(t,e).equals(n))throw new le(`quest SHA1 mismatch for region "${e}" \u2014 wrong region, or not QuestCipher-wrapped`);return Buffer.from(t)}f();function pp(a){return{suppliesPtr:a.u32(8),rewardsPtr:a.u32(12),questScriptPtr:a.u32(16),largeMonPtr:a.u32(20),smallMonPtr:a.u32(24),gatheringLocTblPtr:a.u32(28),gatheringItemsPtr:a.u32(36),monSizeModifier:a.u32(56),rank:a.u8(68),spawn:a.u8(69),supplyCond:a.u8(70),unknownFlags:[a.u8(71),a.u8(72),a.u8(73),a.u8(74)],attackRoll:a.u8(75),questType:a.u32(76),fee:a.u32(80),reward:a.u32(84),penalty:a.u32(88),timeLimit:a.u32(92),stringPtrTbl:a.u32(96),questId:a.u16(100),questStars:a.u8(102),map:a.u8(104),specialCond:a.u8(105),targetId:a.u16(112),targetNum:a.u16(114),arenaPtr:a.u32(124)}}function ip(a,e){let r=[];if(e.suppliesPtr===0)return r;let s=e.suppliesPtr;for(;a.u16(s)!==0;)r.push({itemId:a.u16(s),amount:a.u16(s+2)}),s+=4;return r}function lp(a,e){let r=[];if(e.rewardsPtr===0)return r;let s=e.rewardsPtr;for(;a.u16(s)!==65535;){let n=a.u32(s+4),o=[],t=n;for(;a.u16(t)!==65535;)o.push({chance:a.u16(t),itemId:a.u16(t+2),amount:a.u16(t+4)}),t+=6;r.push({unkn1:a.u16(s),unkn2:a.u16(s+2),itemsPtr:n,items:o}),s+=8}return r}var mp=60;function cp(a,e){let r=[],s=e;for(;a.s16(s)!==-1;)r.push({monsterId:a.u16(s),quantity:a.u8(s+4),power:a.u8(s+5),attr1:a.u8(s+6),attr2:a.u8(s+7),stage:a.u16(s+8)}),s+=mp;return r}function dp(a,e){let r=[];if(e.largeMonPtr===0)return r;let s=e.largeMonPtr;for(;a.u16(s)!==0;){let n=a.u32(s+12);r.push(...cp(a,n)),s+=16}return r}var up=60;function yp(a,e){let r=[],s=e;for(;a.u16(s)!==65535;)r.push({monsterId:a.u16(s),quantity:a.u8(s+4),power:a.u8(s+5)}),s+=up;return r}function fp(a,e){let r=[],s=e;for(;a.u32(s)!==0;){let n=a.u16(s),o=a.u32(s+12);r.push({stageId:n,monsters:yp(a,o)}),s+=16}return r}function hp(a,e){let r=[];if(e.smallMonPtr===0)return r;let s=e.smallMonPtr;for(;a.u16(s)!==0;){let n=a.u32(s);r.push(...fp(a,n)),s+=4}return r}var Ks=["eng1","eng2","ger","fre","spa","ita","eng3"];function bp(a,e){let r=s=>{let n=a.u32(e+s);return n===0?"":a.cString(n,4096,"utf8")};return{title:r(0),goal:r(4),fail:r(8),details:r(12),monsters:r(16),client:r(20)}}function gp(a,e){let r={};if(e.stringPtrTbl===0)return r;let s=e.stringPtrTbl;return Ks.forEach((n,o)=>{let t=a.u32(s+o*4);t!==0&&(r[n]=bp(a,t))}),r}function _p(a,e){let r=gp(a,e);for(let s of Ks){let n=r[s];if(n)return n}return null}function dr(a){let e=new F(a),r=pp(e);return{header:r,supplies:ip(e,r),rewards:lp(e,r),largeMonsters:dp(e,r),smallMonsters:hp(e,r),strings:_p(e,r)}}var wp=/^mission_jpn\/m\d+\.mib$/;function Ns(a="jp"){let e=Xe(a);return Ts(a).map(r=>({index:r,path:e.get(r)})).filter(r=>wp.test(r.path))}f();f();f();var Vs=new Uint8Array([192,168,202,7,75,110,72,111,214,146,49,44,157,251,225,80,97,198,228,82,62,18,173,51,174,235,243,47,107,105,123,83,150,196,177,156,28,197,32,134,25,19,233,106,38,117,120,140,67,237,122,102,93,24,29,232,112,165,94,242,95,88,5,70,13,151,158,124,234,101,221,36,143,73,66,175,244,37,184,43,8,114,23,217,164,211,147,113,91,64,178,46,11,126,76,4,247,17,193,55,121,167,41,188,27,86,139,250,141,54,59,109,212,87,131,189,31,215,98,132,245,218,213,171,204,162,71,136,154,45,199,223,203,2,40,65,169,61,216,161,35,60,129,108,92,208,104,201,191,153,1,190,249,252,236,183,10,130,137,220,145,239,20,207,52,74,3,209,186,53,138,6,255,56,160,240,206,125,12,118,194,179,172,9,148,85,84,128,163,149,187,166,48,42,246,103,30,254,119,99,100,135,96,0,176,152,68,238,77,229,195,205,81,34,115,155,224,26,116,200,90,63,78,230,170,127,33,241,89,159,185,144,79,226,253,180,22,227,248,14,231,21,133,57,58,222,15,210,182,142,39,219,181,50,69,16]),zs=new Uint8Array([203,150,133,166,95,62,171,3,80,183,156,92,178,64,239,246,255,97,21,41,162,241,236,82,53,40,217,104,36,54,196,116,38,226,213,140,71,77,44,250,134,102,193,79,11,129,91,27,192,10,253,23,164,169,109,99,173,243,244,110,141,137,20,221,89,135,74,48,206,254,63,126,6,73,165,4,94,208,222,232,15,212,19,31,186,185,105,113,61,228,220,88,144,52,58,60,202,16,118,199,200,69,51,195,146,29,43,28,143,111,5,7,56,87,81,214,218,45,179,198,46,100,50,30,67,177,93,225,187,142,157,114,119,242,39,201,127,158,170,106,47,108,249,72,231,160,9,86,184,189,32,65,205,149,128,215,35,12,66,229,174,139,125,188,84,57,191,101,1,136,224,123,182,22,24,75,204,34,90,181,235,252,248,155,78,230,168,190,103,115,151,148,0,98,180,210,33,37,17,130,219,147,2,132,124,211,176,163,145,167,247,85,112,122,8,117,138,83,121,251,159,70,245,131,216,14,233,237,18,209,223,240,55,42,68,25,154,49,207,161,175,227,59,26,76,120,194,96,238,152,107,13,153,234,197,172]);var Sa=[9029,32653],Ws=[65497,65521],Sp=new Set([22,23,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42]),kp=new Set([42,43,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62]);function xp(a){return a==="jp"?Sp:kp}function ur(a,e){return xp(e).has(a)}var ka=class{key0;key1;constructor(e){let r=e>>>16,s=e&65535;this.key0=r===0?Sa[0]:r,this.key1=s===0?Sa[1]:s}next(){return this.key0=this.key0*Sa[0]%Ws[0],this.key1=this.key1*Sa[1]%Ws[1],(this.key0<<16>>>0)+this.key1}};function xa(a,e){if(a.length%4!==0)throw new Error(`decryptDataBinBlock: length ${a.length} is not a multiple of 4`);let r=Buffer.alloc(a.length);for(let o=0;o<a.length;o++)r[o]=zs[a[o]];let s=new ka(e),n=Buffer.alloc(a.length);for(let o=0;o<a.length;o+=4){let t=r.readUInt32LE(o);n.writeUInt32LE((t^s.next())>>>0,o)}return n}function $s(a,e){if(a.length%4!==0)throw new Error(`encryptDataBinBlock: length ${a.length} is not a multiple of 4`);let r=new ka(e),s=Buffer.alloc(a.length);for(let o=0;o<a.length;o+=4){let t=a.readUInt32LE(o);s.writeUInt32LE((t^r.next())>>>0,o)}let n=Buffer.alloc(a.length);for(let o=0;o<a.length;o++)n[o]=Vs[s[o]];return n}var Fe=class{constructor(e,r,s){this.readAt=e;this.size=r;this.region=s;let n=xa(e(0,4),0).readUInt32LE(0),o=xa(e(0,n*C),0),t=r/C,i=[];for(let p=0;p<o.length/4;p++){let m=o.readUInt32LE(p*4);if(i.push(m),m===t)break}if(i.at(-1)!==t)throw new Error("DATA.BIN's table of contents has no entry for the end of the file");this.starts=i}starts;cache=new Map;get fileCount(){return this.starts.length-1}offsetOf(e){return this.startLba(e)*C}lengthOf(e){return(this.starts[e+1]-this.startLba(e))*C}startLba(e){if(!Number.isInteger(e)||e<0||e>=this.fileCount)throw new RangeError(`DATA.BIN has no file ${e} (it has ${this.fileCount})`);return this.starts[e]}read(e){let r=this.cache.get(e);if(r)return r;let s=this.readAt(this.offsetOf(e),this.lengthOf(e)),n=ur(e,this.region)?s:xa(s,this.startLba(e));return this.cache.set(e,n),n}encode(e,r){if(r.length!==this.lengthOf(e))throw new Error(`DATA.BIN file ${e} would change size (${this.lengthOf(e)} -> ${r.length} bytes); only same-size edits are supported`);return ur(e,this.region)?Buffer.from(r):$s(r,this.startLba(e))}};f();var vp=24;function va(a,e){let r=cr(a,e),s=[0,2,4,6].map(o=>a.readUInt16LE(o)),n=mr(a);return{payload:r,seal(o){if(o.length!==r.length)throw new Error(`quest would change size (${r.length} -> ${o.length} bytes); only same-size edits are supported`);let t=Buffer.from(n);return lr(o,e).copy(t,4),o.copy(t,vp),Os(t,s)}}}var Ba="/PSP_GAME/USRDIR/DATA.BIN",Ue="/PSP_GAME/SYSDIR/EBOOT.BIN",Bp="overlay/game_sub.ovl",Ep="overlay/game_task.ovl",Gp="overlay/lobby_task.ovl";function Tp(a){if(!a.subarray(0,4).equals(Buffer.from([127,69,76,70])))throw new Error("That EBOOT isn't decrypted (no ELF header). Use PPSSPP's dump: Settings, Tools, Developer tools, \u201CDump Decrypted Eboot.bin on game boot\u201D.");return a}function Cp(a,e){for(let[r,s]of Xe(a))if(s===e)return r;throw new Error(`No DATA.BIN entry named ${e} for region ${a}`)}async function qs(a,e,r){let{region:s,discId:n}=ya(ua(e.readFile("/PSP_GAME/PARAM.SFO")));if(!s||!n)throw new Error(`Unrecognized disc (DISC_ID "${n??"?"}"): expected an MHP2G/MHFU disc`);let o=e.stat(Ba),t=o.lba*2048,i=new Fe((d,y)=>a.read(t+d,y),o.size,s),p=[],m=[];for(let d of Ns(s))try{let y=va(i.read(d.index),s);p.push({index:d.index,path:d.path,file:y,parsed:dr(y.payload)})}catch(y){m.push({path:d.path,reason:String(y)})}let c=d=>{let y=Cp(s,d);return{index:y,ovl:As(i.read(y))}},l=null,u;if(r.eboot&&(l=r.eboot.dump?Tp(r.eboot.dump):await da(e.readFile(Ue),r.eboot),s!=="jp")){let d=Us.resolverForRegion(s);if(!d)throw new Error(`No EBOOT table addresses for region ${s} yet`);u=new ba(d,Buffer.from(l))}return{region:s,discId:n,dataBinEntry:o,dataBin:i,quests:p,skippedQuests:m,gameSub:c(Bp),gameTask:c(Ep),lobbyTask:c(Gp),eboot:l,resolver:u}}f();f();var Ea=class{constructor(e){this.game=e}quests=new Map;files=new Map;ebootCopy=null;quest(e){let r=this.quests.get(e.index);return r||(r={quest:e,payload:Buffer.from(e.file.payload)},this.quests.set(e.index,r)),r.payload}overlay(e){let r=this.files.get(e.index);return r||(r=Buffer.from(this.game.dataBin.read(e.index)),this.files.set(e.index,r)),r}eboot(){if(!this.game.eboot)throw new Error("The EBOOT wasn't loaded");return this.ebootCopy??=Buffer.from(this.game.eboot),this.ebootCopy}changedEboot(){return this.ebootCopy&&!this.ebootCopy.equals(this.game.eboot)?this.ebootCopy:null}};f();f();f();f();var Rp=N.join(N.dirname(pe("file:///randomfu/bundle.js")),"..","..","vendor","mhp2g-patterns","includes"),Mp=/^[－\-]+$/u;function Ap(a){let e=new Map,r=/str\s+(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*\{([\s\S]*?)\};/g;for(let s of a.matchAll(r)){let[,n,o,t]=s,i=Number.parseInt(o,10),p=[],m=/"((?:[^"\\]|\\.)*)"/g;for(let c of t.matchAll(m))p.push(c[1].replace(/\\"/g,'"').replace(/\\\\/g,"\\"));if(p.length<i/2)throw new Error(`enums: ${n} declared ${i} entries but parsed only ${p.length} \u2014 .enum format may have changed`);e.set(n,p)}return e}var yr=null;function Xs(){if(yr)return yr;let a=new Map;for(let e of["equip.enum","items.enum","monster.enum"]){let r=Ae(N.join(Rp,e),"utf-8");for(let[s,n]of Ap(r))a.set(s,n)}return yr=a,a}function Ip(a){return Mp.test(a)}function Js(a,e,r){let s=a.get(e);if(!s)throw new Error(`enums: unknown table "${e}"`);let n=s[r];return n===void 0||Ip(n)?null:n.trim()}var hr=class{source="mhp2g-patterns-enum";enums=Xs();resolve(e,r){return Js(this.enums,e,r)}},fr=null;function Ze(){return fr||(fr=new hr),fr}f();f();f();function Zs(a){return a>=1&&a<4e3?"guild":a>=4e3&&a<5e3?"treasure-hunting":a>=1e4&&a<12e3?"village":a>=2e4&&a<23e3?"training-school":a>=30001&&a<=30090?"guild":null}var Hp=new Set(["**********","none"]);function Qs(a){return Hp.has(a.strings?.title??"")}var Dp=["low","high","g"],Ga={low:"Low Rank",high:"High Rank",g:"G Rank"};function Ys(a,e){return e==="rank"?{band:a.band,stars:0}:e==="none"?{band:"low",stars:0}:a}function V(a){return`${a.band}:${a.stars}`}function me(a){return Dp.indexOf(a.band)*100+a.stars}function ge(a){return a.stars===0?Ga[a.band]:`${Ga[a.band]} ${a.stars}\u2605`}var Lp={1:"low",2:"high",5:"g"},Pp=30001;function ce(a){let e=a.header.questId,r=Zs(e);if(r!=="guild"&&r!=="village"||e>=Pp||Qs(a))return null;let s=Lp[a.header.rank]??(a.header.rank===0?"low":null);return s?{band:s,stars:Math.max(1,a.header.questStars)}:null}function en(a){return a==="low"||a==="high"||a==="g"?a:null}function Ta(a){let e=new Map;for(let{itemId:r,tier:s}of a){let n=e.get(r);(n===void 0||me(s)<me(n))&&e.set(r,s)}return e}function br(a,e){return`${a}:${e}`}function an(a){let e=new Map,r=(s,n)=>{let o=br(s,n.band),t=e.get(o);(t===void 0||n.stars<t)&&e.set(o,n.stars)};for(let s of a){let n=ce(s);if(n){for(let o of s.largeMonsters)r(o.monsterId,n);for(let o of s.smallMonsters)for(let t of o.monsters)r(t.monsterId,n)}}return e}f();var Ca=class a{constructor(e){this.seed=e;let r=Te("sha256").update(e,"utf8").digest();this.s=new Uint32Array(4);for(let s=0;s<4;s++)this.s[s]=r.readUInt32LE(s*4);this.s.every(s=>s===0)&&(this.s[0]=1)}s;fork(e){return new a(`${this.seed}\0${e}`)}nextU32(){let e=this.s,r=Math.imul(rn(Math.imul(e[1],5),7),9)>>>0,s=e[1]<<9;return e[2]^=e[0],e[3]^=e[1],e[1]^=e[2],e[0]^=e[3],e[2]^=s,e[3]=rn(e[3],11),r}float(){return this.nextU32()/4294967296}int(e){if(!Number.isInteger(e)||e<=0||e>4294967296)throw new RangeError(`int(${e})`);let r=Math.floor(4294967296/e)*e;for(;;){let s=this.nextU32();if(s<r)return s%e}}shuffle(e){for(let r=e.length-1;r>0;r--){let s=this.int(r+1);[e[r],e[s]]=[e[s],e[r]]}return e}};function rn(a,e){return(a<<e|a>>>32-e)>>>0}f();f();var de={kind:"number",min:0,max:.95,step:.05,percent:!0},Ye=[{key:"logic.tiers",section:"Logic",label:"Keep items in their place in the game",help:"How far an item can move. Shuffles only swap items found first at the same point in the game, so recipes stay craftable as early as before.",type:{kind:"choice",choices:[{value:"star",label:"Same star level",help:"Items only move between things first found at the same rank and star level. A 1\u2605 recipe stays makeable at 1\u2605."},{value:"rank",label:"Same rank",help:"Items move anywhere within Low, High or G Rank. Early recipes can ask for late Low Rank parts."},{value:"none",label:"Anywhere (chaos)",help:"No logic: any item can go anywhere. Recipes may need G Rank parts in Low Rank."}]},default:"star"},{key:"questRewards.enabled",section:"Quest rewards",label:"Shuffle quest rewards",help:"Items and amounts move between Village and Guild quests; each slot keeps its chance. Training School and Treasure Hunting quests are left alone.",type:{kind:"boolean"},default:!0},{key:"monsterRewards.enabled",section:"Monster rewards",label:"Shuffle carves",help:"Body, tail and shiny drop items move between monsters; chances stay with each slot.",type:{kind:"boolean"},default:!0},{key:"monsterRewards.captureAndBreaks",section:"Monster rewards",label:"Also shuffle capture and break rewards",help:"Include capture rewards and part-break rewards in the same pool as carves.",type:{kind:"boolean"},default:!0,enabledBy:"monsterRewards.enabled"},{key:"gathering.enabled",section:"Gathering",label:"Shuffle gathering points",help:"Items from mining, gathering and bug catching points move between Village and Guild quests (see Logic); each spot keeps its odds. Training School and Treasure Hunting quests are left alone.",type:{kind:"boolean"},default:!1},{key:"gathering.pool",section:"Gathering",label:"What gathering points give",help:"Where gathering points' items come from.",type:{kind:"choice",choices:[{value:"gathered",label:"Items you could gather",help:"The same items, moved between spots at the same point in the game."},{value:"rank",label:"Any item from the same rank",help:"A Low Rank quest's spots can give anything first found in Low Rank, monster parts included; likewise High and G Rank."},{value:"any",label:"Any item (chaos)",help:"Any item in the game, at any rank."}]},default:"gathered",enabledBy:"gathering.enabled"},{key:"gathering.keepItems",section:"Gathering",label:"Keep every gatherable item findable",help:"With a wider pool, each item you could gather is still at one or more spots at the same point in the game, so recipes stay craftable. The rest of the spots get random items.",type:{kind:"boolean"},default:!0,enabledBy:"gathering.enabled"},{key:"recipes.materials",section:"Crafting",label:"Shuffle recipe materials",help:"Each crafting and upgrade material is replaced by another (see Logic). Shop, combined and ticket items stay.",type:{kind:"boolean"},default:!1,eboot:!0},{key:"recipes.amounts",section:"Crafting",label:"Randomize material amounts",help:"Each amount is rescaled to how many of that material recipes usually ask for, then varied.",type:{kind:"boolean"},default:!1,eboot:!0},{key:"recipes.amountSpread",section:"Crafting",label:"Amount variation",help:"How far an amount can move from its usual value, up or down.",type:de,default:.5,enabledBy:"recipes.amounts"},{key:"recipes.maxQuantity",section:"Crafting",label:"Most of one material",help:"The largest amount of a single material a recipe can ask for.",type:{kind:"number",min:1,max:99,step:1},default:99,enabledBy:"recipes.amounts"},{key:"costs.enabled",section:"Costs",label:"Randomize crafting costs",help:"Weapon, armor and decoration zenny costs vary, in steps of 10z. A weapon's upgrade cost changes with it.",type:{kind:"boolean"},default:!1,eboot:!0},{key:"costs.spread",section:"Costs",label:"Cost variation",help:"How far a cost can move from its usual value, up or down.",type:de,default:.5,enabledBy:"costs.enabled"},{key:"weapons.enabled",section:"Weapons",label:"Shuffle weapon progression",help:"Each place in the smithy gives a different weapon of the same rarity. Places keep their materials and upgrade links; weapons keep their stats and cost.",type:{kind:"boolean"},default:!1,eboot:!0},{key:"weapons.mix",section:"Weapons",label:"Weapon types",help:"Whether a place keeps its weapon type.",type:{kind:"choice",choices:[{value:"same-type",label:"Same type",help:"A Great Sword place gets another Great Sword."},{value:"any-type",label:"Any type in the family",help:"Any Blademaster (or any Gunner) weapon of the same rarity. A Great Sword line can turn into a Hunting Horn line."}]},default:"same-type",enabledBy:"weapons.enabled"},{key:"armor.enabled",section:"Armor",label:"Shuffle armor progression",help:"Each place in the smithy gives a different armor piece for the same slot and rarity, wearable by the same hunters (Blademaster, Gunner or both; male, female or both). Places keep their materials; pieces keep their stats, skills and cost.",type:{kind:"boolean"},default:!1,eboot:!0},{key:"shops.enabled",section:"Shops",label:"Randomize shops",help:"Each item a shop sells is replaced by another, the same in every stage of that shop, so later stages still include earlier stock.",type:{kind:"boolean"},default:!1},{key:"shops.pool",section:"Shops",label:"What shops can sell",help:"Where replacement items come from.",type:{kind:"choice",choices:[{value:"shop",label:"Shop items",help:"Only items shops sell anyway, in new places and stages."},{value:"low",label:"Shop items and Low Rank items",help:"Also anything first found in Low Rank: herbs, ores, bones, Low Rank monster parts."},{value:"high",label:"Up to High Rank items",help:"Also anything first found in High Rank."},{value:"any",label:"Any item (chaos)",help:"Any item in the game, G Rank parts and jewels included."}]},default:"shop",enabledBy:"shops.enabled"},{key:"shops.mix",section:"Shops",label:"Shops share replacements",help:"Whether one item is replaced by the same thing in every shop. With shop items only, this also decides whether shops trade stock.",type:{kind:"choice",choices:[{value:"each",label:"Each shop on its own",help:"Every shop has its own replacements (shops that share stock lists share them)."},{value:"all",label:"All shops together",help:"One replacement per item everywhere; with shop items only, granny's herbs can reach the general store."}]},default:"each",enabledBy:"shops.enabled"},{key:"shops.keepEssentials",section:"Shops",label:"Keep the essentials on sale",help:"Potion, Whetstone, pickaxes, bugnets, BBQ Spit, Normal S Lv1/2 and Empty Bottle stay where they are.",type:{kind:"boolean"},default:!0,enabledBy:"shops.enabled"},{key:"shops.special",section:"Shops",label:"Include the sphere and jewel shop",help:"Armor Spheres, jewels, Pokke Tickets and Gourmet BBQ Spit. Off keeps armor upgrades as usual.",type:{kind:"boolean"},default:!1,enabledBy:"shops.enabled"},{key:"shops.countSpread",section:"Shops",label:"How many items each shop sells",help:"Each shop sells up to this much more or fewer, every stage alike. Above 0, the shop lists are rewritten and the game is pointed at their new places.",type:de,default:0,enabledBy:"shops.enabled"},{key:"shops.prices",section:"Shops",label:"Randomize prices",help:"Change the price of everything shops sell. A price is the item's own, so it's the same in every shop.",type:{kind:"boolean"},default:!1,eboot:!0,enabledBy:"shops.enabled"},{key:"shops.priceSpread",section:"Shops",label:"Price variation",help:"How far a price can move, up or down.",type:de,default:.5,enabledBy:"shops.prices"},{key:"shops.stacks",section:"Shops",label:"Randomize carry limits",help:"Change how many of each item you can carry (1 to 99), for everything shops sell. This applies everywhere, not just in shops.",type:{kind:"boolean"},default:!1,eboot:!0,enabledBy:"shops.enabled"},{key:"shops.stackSpread",section:"Shops",label:"Carry limit variation",help:"How far a carry limit can move, up or down.",type:de,default:.5,enabledBy:"shops.stacks"},{key:"questMonsters.species",section:"Quest monsters",label:"Swap large monsters",help:"Village and Guild quests get other large monsters. A monster only goes to a map it's found on somewhere in the game, and the quest's target follows it. Quest text still names the old monster. Untested on a real disc.",type:{kind:"boolean"},default:!1},{key:"questMonsters.speciesPool",section:"Quest monsters",label:"Which monsters can appear",help:"What a quest's large monsters can turn into.",type:{kind:"choice",choices:[{value:"variants",label:"Variants only",help:"A monster becomes one of its own variants: Rathian, Pink Rathian or Gold Rathian. Quests with several monsters change too."},{value:"rank",label:"Any monster from the same rank",help:"Any large monster met in a quest of the same rank (Low, High or G). Only quests with one kind of large monster change."},{value:"any",label:"Any monster (chaos)",help:"Any large monster found on the quest's map, at any rank. Only quests with one kind of large monster change."}]},default:"variants",enabledBy:"questMonsters.species"},{key:"questMonsters.difficulty",section:"Quest monsters",label:"Randomize monster difficulty",help:"Each large monster in a Village or Guild quest gets another difficulty level: the row of HP, attack and defense multipliers the quest picks for it.",type:{kind:"boolean"},default:!1},{key:"questMonsters.difficultySpread",section:"Quest monsters",label:"Difficulty variation",help:"How many difficulty levels a monster can move, up or down (there are 32).",type:{kind:"number",min:1,max:31,step:1},default:4,enabledBy:"questMonsters.difficulty"},{key:"questMonsters.difficultyRange",section:"Quest monsters",label:"Difficulty limits",help:"How hard or easy a monster can get.",type:{kind:"choice",choices:[{value:"rank",label:"Within its rank",help:"Only levels quests of the same rank use: a Low Rank monster never gets G Rank multipliers."},{value:"any",label:"Any level (chaos)",help:"Any level a Village or Guild quest uses. Low Rank monsters can hit like G Rank ones."}]},default:"rank",enabledBy:"questMonsters.difficulty"},{key:"questMonsters.smallCounts",section:"Quest monsters",label:"Randomize small monster counts",help:"How many of each small monster a Village or Guild quest has. Never more than any quest has on the disc.",type:{kind:"boolean"},default:!1},{key:"questMonsters.smallCountSpread",section:"Quest monsters",label:"Count variation",help:"How far a count can move, up or down.",type:de,default:.5,enabledBy:"questMonsters.smallCounts"},{key:"monsterStats.hp",section:"Monster stats",label:"Randomize monster HP",help:"Each monster's base HP changes, everywhere it appears. Quests still multiply it by their own difficulty.",type:{kind:"boolean"},default:!1},{key:"monsterStats.hpSpread",section:"Monster stats",label:"HP variation",help:"How far HP can move, up or down.",type:de,default:.25,enabledBy:"monsterStats.hp"},{key:"monsterStats.size",section:"Monster stats",label:"Randomize monster size",help:"Each monster's base size changes, everywhere it appears. Untested on a real disc: big changes may look or play oddly.",type:{kind:"boolean"},default:!1},{key:"monsterStats.sizeSpread",section:"Monster stats",label:"Size variation",help:"How far size can move, up or down.",type:{kind:"number",min:0,max:.5,step:.05,percent:!0},default:.2,enabledBy:"monsterStats.size"},{key:"monsterStats.status",section:"Monster stats",label:"Randomize status resistance",help:"How much poison, paralysis, sleep and KO damage each monster takes before it's affected, and how much more each time after.",type:{kind:"boolean"},default:!1},{key:"monsterStats.statusSpread",section:"Monster stats",label:"Resistance variation",help:"How far a resistance can move, up or down.",type:de,default:.5,enabledBy:"monsterStats.status"},{key:"weaknesses.elements",section:"Weaknesses",label:"Shuffle elemental weaknesses",help:"Each monster's fire, water, ice, thunder and dragon weaknesses trade places: a monster weak to fire may now be weak to ice instead. Every part keeps its overall profile.",type:{kind:"boolean"},default:!1},{key:"weaknesses.parts",section:"Weaknesses",label:"Shuffle weak spots",help:"Each large monster's body parts trade hitzones: the head may now be as tough as the tail was. Breaks and flinches stay with the part.",type:{kind:"boolean"},default:!1}],sn=new Map(Ye.map(a=>[a.key,a]));function nn(a){let e={seed:a};for(let r of Ye)e[r.key]=r.default;return e}var _e=class extends Error{};function Fp(a,e){let r=sn.get(a);if(!r)throw new _e(`Unknown setting "${a}"`);let s=r.type;if(s.kind==="boolean"){if(e===!0||e==="true"||e==="on")return!0;if(e===!1||e==="false"||e==="off")return!1;throw new _e(`${a} must be true or false`)}if(s.kind==="number"){let n=typeof e=="string"?Number(e):e;if(typeof n!="number"||!Number.isFinite(n)||n<s.min||n>s.max)throw new _e(`${a} must be a number from ${s.min} to ${s.max}`);return s.step>=1?Math.round(n):n}if(typeof e!="string"||!s.choices.some(n=>n.value===e))throw new _e(`${a} must be one of ${s.choices.map(n=>n.value).join(", ")}`);return e}function on(a,e){let r={...a};for(let[s,n]of Object.entries(e))if(s==="seed"){if(typeof n!="string"||n.trim()==="")throw new _e("seed must be a non-empty string");r.seed=n.trim()}else r[s]=Fp(s,n);return r}function Ra(a){return Ye.some(e=>e.eboot&&a[e.key]===!0&&gr(a,e))}function gr(a,e){if(!e.enabledBy)return!0;let r=sn.get(e.enabledBy);return a[e.enabledBy]===!0&&gr(a,r)}function Up(a){return a.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}function Ma(a){let e={v:6,seed:a.seed};for(let r of Ye)a[r.key]!==r.default&&(e[r.key]=a[r.key]);return`RF${Up(Buffer.from(JSON.stringify(e),"utf8"))}`}function jp(a,e){let r=a.type;return r.kind==="boolean"?e?"yes":"no":r.kind==="number"&&r.percent?`\xB1${Math.round(Number(e)*100)}%`:r.kind==="choice"?r.choices.find(s=>s.value===e)?.label??String(e):String(e)}function Aa(a){return Ye.filter(e=>gr(a,e)).map(e=>`${e.section} / ${e.label}: ${jp(e,a[e.key])}`)}f();f();f();var je=["head","chest","arm","waist","leg"],Ia={head:T.headArmor,chest:T.chestArmor,arm:T.armArmor,waist:T.waistArmor,leg:T.legArmor},Op={leg:0,head:1,chest:2,arm:3,waist:4},Kp={head:"armorValuesHead",chest:"armorValuesChest",arm:"armorValuesArm",waist:"armorValuesWaist",leg:"armorValuesLeg"};function Ha(a,e){let r={},s=e?void 0:ir("armorValuePointers");for(let n of je)r[n]=e?e.resolve(Kp[n],a.buf):Cs(a,s+Op[n]*4,He);return r}f();var Np=[["head",437],["chest",435],["arm",426],["waist",424],["leg",434],["greatSwordLongSword",131],["lanceGunlance",117],["swordAndShieldDualBlades",131],["hammerHuntingHorn",124],["ancientRustBlademaster",8],["lightBowgun",135],["heavyBowgun",107],["bow",61],["ancientRustGunner",2],["decoration",192]],Vp=new Set(["leg","ancientRustGunner"]);function Oe(a,e){let r=U("equipmentCreate",a,e),s={};for(let[n,o]of Np)s[n]={offset:r,count:o},r+=o*X,Vp.has(n)&&(r+=2,r+=X);return s}function Da(a,e){let r=U("equipmentUpgrade",a,e);r+=J;let s={offset:r,count:T.weaponsBlademaster};r+=T.weaponsBlademaster*J;let n={offset:r,count:T.weaponsGunner};return r+=T.weaponsGunner*J,r+=196,{blademaster:s,gunner:n,armorSphere:{offset:r,count:7}}}f();f();var bc=N.join(N.dirname(pe("file:///randomfu/bundle.js")),"materials.json");var _r={male:1,female:2,blademaster:4,gunner:8};f();var wr=Ze();function I(a){return wr.resolve("ItemID",a)??`Item ${a}`}function Z(a){return wr.resolve("emID",a)??`Monster ${a}`}function W(a,e){return wr.resolve(a,e)}function ue(a){let e=String(a.parsed.header.questId).padStart(5,"0"),r=a.parsed.strings?.title;return r?`${e} ${r}`:e}f();function $(a,e,r,s){let n=new Map;a.forEach((t,i)=>{let p=e(t),m=n.get(p);m?m.push(i):n.set(p,[i])});let o=new Array(a.length);for(let t of n.values()){let i=s.shuffle(t.map(p=>r(a[p])));t.forEach((p,m)=>o[p]=i[m])}return o}var Qp=4,Yp=5,ei={head:{table:"HeadArmorID",label:"Head"},chest:{table:"ChestArmorID",label:"Chest"},arm:{table:"ArmArmorID",label:"Arms"},waist:{table:"WaistArmorID",label:"Waist"},leg:{table:"LegArmorID",label:"Legs"}};function ai(a){let{male:e,female:r,blademaster:s,gunner:n}=_r,o=[];return a&n||o.push("Blademaster"),a&s||o.push("Gunner"),a&r||o.push("male only"),a&e||o.push("female only"),o.join(", ")}function ri(a){let{male:e,female:r,blademaster:s,gunner:n}=_r;return(a&(e|r))!==0&&(a&(s|n))!==0}function tn(a,e,r,s){let n=new F(a),o=Oe(n,e),t=Ha(n,e),i=s.eboot(),p=[],m=0,c=0;return je.forEach((l,u)=>{let d=Ia[l],{table:y,label:b}=ei[l],v=x=>W(y,x)??`${b} ${x}`,_=x=>t[l]+x*Je,w=x=>n.u8(_(x)+Qp),E=x=>n.u8(_(x)+Yp),{offset:g,count:B}=o[l],G=Array.from({length:B},(x,R)=>g+R*X),k=[...new Set(G.map(x=>n.u16(x+2)))].filter(x=>x>0&&x<d&&ri(w(x))).sort((x,R)=>x-R);c+=k.length;let D=$(k,x=>`${E(x)}:${w(x)}`,x=>x,r),A=new Map(k.map((x,R)=>[x,D[R]]));for(let x of G){let R=n.u16(x+2);i.writeUInt16LE(A.get(R)??R,x+2)}for(let x of k){let R=A.get(x);if(R===x)continue;m++;let P=ai(w(x));p.push({where:`${b}, rarity ${E(x)+1}`,text:`${v(x)} -> ${v(R)}${P?` (${P})`:""}`,order:u*256+E(x)})}}),{title:"Armor progression",notes:["Each line is a place in the smithy: you now get the second piece where you used to get the first.","The new piece is for the same slot and rarity, and can be worn by the same hunters (Blademaster, Gunner or both; male, female or both).","Places keep their materials; pieces keep their own stats, skills, slots and price. Where a piece had two recipes, both now make the same new piece.",`${m} of ${c} pieces changed places.`],lines:p.sort((l,u)=>l.order-u.order).map(({where:l,text:u})=>({where:l,text:u}))}}f();f();f();f();var Zc=N.join(N.dirname(pe("file:///randomfu/bundle.js")),"decoration-categories.json");var La=948;var si={head:"HeadArmorID",chest:"ChestArmorID",arm:"ArmArmorID",waist:"WaistArmorID",leg:"LegArmorID"},ni=20;function pn(a,e){let r=new F(a),s=[],n=(i,p,m)=>{let c=r.u32(m);p&&c>0&&s.push({name:p,kind:i,offset:m,price:c})};for(let[i,p,m,c]of[["weaponsBlademaster","WepBMID",Le,T.weaponsBlademaster],["weaponsGunner","WepGunID",Pe,T.weaponsGunner]]){let l=U(i,r,e);for(let u=1;u<c;u++)n("Weapon",W(p,u),l+u*m+4)}let o=Ha(r,e);for(let i of je)for(let p=1;p<Ia[i];p++)n("Armor",W(si[i],p),o[i]+p*Je+8);let t=U("decorationValues",r,e);for(let i=0;i<T.decorations;i++){let p=I(i+La);n("Decoration",p.startsWith("Item ")?null:p,t+i*q+12)}return s}function ln(a,e,r,s){let n=s.eboot(),o=a.map(t=>{let i=1-e+r.float()*2*e,p=Math.max(ni,Math.round(t.price*i/20)*20);return n.writeUInt32LE(p,t.offset),{where:t.kind,text:`${t.name}: ${p/2}z (was ${Math.round(t.price/2)}z)`}});return{title:"Crafting costs",notes:[`Each weapon, armor piece and decoration costs ${Math.round((1-e)*100)}% to ${Math.round((1+e)*100)}% of its usual price, in steps of 10z.`,"A weapon's upgrade cost is its own price too, so it changes with it."],lines:o}}f();f();var oi={1:7,2:13,3:12,4:11,5:12,6:11,7:2,8:2,9:2,10:0,11:10,12:4,13:2,14:8,15:11,16:13,17:12,18:11,19:12,20:11,21:10,22:2,23:2,26:11,27:13,28:13,29:10,30:10,31:10},ti=28,pi=36,mn=24,ii=3212836864,li=256,mi=512,ci=64,di=2e3,ye=a=>({items:[],slots:[],problem:a});function cn(a,e){let r=(c,l)=>c>=128&&c+l<=a.length,s=a.readUInt32LE(ti),n=a.readUInt32LE(pi);if(s===0||n===0)return{items:[],slots:[]};let o=oi[e.header.map];if(o===void 0)return ye(`unknown map ${e.header.map}`);if(!r(s,o*4))return ye("area table out of bounds");let t=new Set;for(let c=0;c<o;c++){let l=a.readUInt32LE(s+c*4);if(l===0)continue;let u=l;for(let d=0;;d++,u+=mn){if(!r(u,4)||d>li)return ye(`area ${c}'s node list doesn't end`);if(a.readUInt32LE(u)===ii)break;if(!r(u,mn))return ye("node out of bounds");t.add(a.readUInt16LE(u+16))}}let i=new Set,p=[],m=new Set;for(let c of[...t].sort((l,u)=>l-u)){if(c>=mi||!r(n+c*4,4))return ye(`node uses item table ${c}, past the table list`);let l=a.readUInt32LE(n+c*4);for(let u=0,d=l;;u++,d+=4){if(!r(d,2)||u>ci)return ye(`item table ${c} doesn't end`);if(a.readUInt16LE(d)===65535)break;if(!r(d,4))return ye(`item table ${c} out of bounds`);let y=a.readUInt16LE(d+2);if(y>di)return ye(`item table ${c} has item ${y}`);y===0||m.has(d)||(m.add(d),i.add(y),p.push({table:c,offset:d,value:a.readUInt16LE(d),itemId:y}))}}return{items:[...i].sort((c,l)=>c-l),slots:p}}function dn(a){let e=[],r=[],s=0;for(let n of a){let o=ce(n.parsed);if(!o)continue;let t=cn(n.file.payload,n.parsed);t.problem&&r.push(`${n.path}: ${t.problem}`),t.items.length>0&&s++;for(let i of t.slots)e.push({quest:n,tier:o,...i})}return{slots:e,quests:s,problems:r}}function ui(a,e,r,s){let n=a.map(l=>l.itemId),o=s.shuffle(a.map((l,u)=>u)),t=e.keepItems?[...new Set(a.map(l=>l.itemId))].sort((l,u)=>l-u):[];t.forEach((l,u)=>n[o[u]]=l);let i=new Map,p=l=>{let u=e.pool==="rank"?ce(l.quest.parsed)?.band??l.tier.band:"any",d=i.get(u);return d||(d=u==="any"?[...r.allItems]:[...r.bands].filter(([,y])=>y===u).map(([y])=>y).sort((y,b)=>y-b),d.length===0&&(d=[...r.allItems]),i.set(u,d)),d},m=l=>`${l.quest.index}:${l.table}`,c=new Map;for(let l of o.slice(0,t.length)){let u=m(a[l]);c.set(u,(c.get(u)??new Set).add(n[l]))}for(let l of o.slice(t.length)){let u=a[l],d=p(u),y=c.get(m(u))??new Set,b=d[s.int(d.length)];for(let v=0;v<8&&y.has(b);v++)b=d[s.int(d.length)];n[l]=b,c.set(m(u),y.add(b))}return n}function un(a,e,r,s,n){let o;if(e.pool==="gathered")o=$(a,m=>V(m.tier),m=>m.itemId,s);else{o=a.map(c=>c.itemId);let m=new Map;a.forEach((c,l)=>{let u=V(c.tier);m.set(u,[...m.get(u)??[],l])});for(let c of m.values()){let l=ui(c.map(u=>a[u]),e,r,s);c.forEach((u,d)=>o[u]=l[d])}}let t=0,i=a.map((m,c)=>{let l=o[c];return n.quest(m.quest).writeUInt16LE(l,m.offset+2),l!==m.itemId&&t++,{where:ue(m.quest),text:`Table ${m.table}, value ${m.value}: ${I(l)} (was ${I(m.itemId)})`}});return{report:{title:"Gathering points",notes:[{gathered:"Items move between the gathering points of Village and Guild quests of the same rank and star level; each slot keeps its value (how likely it is).",rank:"Gathering points give any item first found at their quest's rank (Low, High or G); each slot keeps its value (how likely it is).",any:"Gathering points give any item in the game; each slot keeps its value (how likely it is)."}[e.pool],...e.pool!=="gathered"?[e.keepItems?"Every item you could gather is still at one or more spots at the same point in the game (see Logic).":"Items you could gather may now be found nowhere; recipes that need them may not be craftable."]:[],"Only item tables a mining, gathering or bug catching node uses take part. Training School, Treasure Hunting and unused quests are unchanged.",`${t} of ${a.length} slots changed.`],lines:i},after:a.map((m,c)=>({itemId:o[c],tier:m.tier}))}}f();f();var Sr=["unranked","low","high","treasure","training","g","misc"],yn=["body","tail","shiny"];function fn(a,e,r){if(!a.isOwnVaddr(e))return null;let s=r?6:4,n=a.reader,o=[];for(let t=a.vaddrToOffset(e);o.length<=32;t+=s){if(t+2>n.length)return null;let i=n.u16(t);if(i===65535)return o;if(t+s>n.length||i>100)return null;let p={chance:i,itemId:n.u16(t+2)};r&&(p.amount=n.u16(t+4)),o.push(p)}return null}function yi(a){let e=[],r=a.reader,s=-1;for(let n=128;n+4<=r.length;n+=4)a.isOwnVaddr(r.u32(n))?s===-1&&(s=n):s!==-1&&(e.push([s,(n-s)/4]),s=-1);return s!==-1&&e.push([s,(r.length-s)/4]),e}function hn(a){let e=yi(a),r=o=>{let t=e.filter(([,p])=>p===o);if(t.length!==1)return null;let[i]=t[0];return{pointers:i,index:i+o*4}},s=r(1088),n=r(924);return s&&n?{carves:s,capBreak:n}:null}var wi=65535;function gn(a){let e=hn(a);if(!e)throw new Error("game_sub.ovl: carve and cap/break tables not found");let r=new Map,s=a.reader,n=(o,t,i,p,m)=>{let c=s.u16(i);if(c===wi||c>=t)return;let l=s.u32(o.pointers+c*4),u=fn(a,l,p);if(!u)return;let d=a.vaddrToOffset(l),y=p?6:4,b=`${y}:${d}`,v=r.get(b);v?v.refs.push(m):r.set(b,{offset:d,stride:y,entries:u,refs:[m]})};for(let o=0;o<89;o++){let t=e.carves.index+o*52;yn.forEach((i,p)=>{Sr.forEach((m,c)=>{n(e.carves,1088,t+p*14+c*2,!1,{emId:o+1,source:i,rank:m})})})}for(let o=e.capBreak.index;o+14<=s.length;){let t=s.u8(o);if(t===255)break;let i=s.u8(o+1),p=i===128?"capture":`break ${i}`;for(let m=0;m<6;m++)n(e.capBreak,924,o+2+m*2,!0,{emId:t,source:p,rank:Sr[m]});o+=14}return[...r.values()].sort((o,t)=>o.offset-t.offset)}function _n(a,e){let r=[];for(let s of a){let n=new Set(s.refs.map(p=>en(p.rank)));if(n.size!==1)continue;let[o]=n;if(!o)continue;let t=s.refs.map(p=>e.get(br(p.emId,o))).filter(p=>p!==void 0);if(t.length===0)continue;let i={band:o,stars:Math.min(...t)};s.entries.forEach((p,m)=>{p.itemId!==0&&r.push({list:s,tier:i,offset:s.offset+m*s.stride,chance:p.chance,itemId:p.itemId,amount:p.amount})})}return r}function Si(a){return[...new Set(a.refs.map(r=>`${Z(r.emId)} ${r.source}`))].join(", ")}function wn(a,e,r,s){let n=$(a,i=>V(i.tier),i=>i.itemId,e),o=r.overlay(s),t=a.map((i,p)=>{let m=n[p];o.writeUInt16LE(m,i.offset+2);let c=i.amount===void 0?"":` x${i.amount}`;return{where:`${Si(i.list)} (${ge(i.tier)})`,text:`${i.chance}% ${I(m)}${c} (was ${I(i.itemId)})`}});return{report:{title:"Monster carves, captures and breaks",notes:["Items move between lists of the same rank and star level (the earliest quest the monster is in); chances and amounts stay with each slot.","Lists shared across ranks, treasure and training lists, and lists of monsters no quest uses at that rank are unchanged."],lines:t},after:a.map((i,p)=>({itemId:n[p],tier:i.tier}))}}f();var ki=6;function Sn(a){let e=[];for(let r of a){let s=ce(r.parsed);if(!s)continue;let n=new Set;for(let o of r.parsed.rewards)o.items.forEach((t,i)=>{let p=o.itemsPtr+i*ki;n.has(p)||t.itemId===0||(n.add(p),e.push({quest:r,tier:s,offset:p,...t}))})}return e}function kn(a,e,r){let s=$(a,o=>V(o.tier),o=>({itemId:o.itemId,amount:o.amount}),e),n=a.map((o,t)=>{let{itemId:i,amount:p}=s[t],m=r.quest(o.quest);return m.writeUInt16LE(i,o.offset+2),m.writeUInt16LE(p,o.offset+4),{where:ue(o.quest),text:`${o.chance}% ${I(i)} x${p} (was ${I(o.itemId)} x${o.amount})`}});return{report:{title:"Quest rewards",notes:["Items and amounts move between Village and Guild quests of the same rank and star level; each slot keeps its chance.","Training School, Treasure Hunting and unused quests are unchanged."],lines:n},after:a.map((o,t)=>({itemId:s[t].itemId,tier:o.tier}))}}f();var xi=4,vi={head:"HeadArmorID",chest:"ChestArmorID",arm:"ArmArmorID",waist:"WaistArmorID",leg:"LegArmorID",greatSwordLongSword:"WepBMID",lanceGunlance:"WepBMID",swordAndShieldDualBlades:"WepBMID",hammerHuntingHorn:"WepBMID",ancientRustBlademaster:"WepBMID",lightBowgun:"WepGunID",heavyBowgun:"WepGunID",bow:"WepGunID",ancientRustGunner:"WepGunID"};function Bi(a,e){if(a==="decoration")return I(e+La);let r=vi[a];return(r&&W(r,e))??`${a} ${e}`}function xn(a,e){let r=new F(a),s=[],n=(i,p)=>{for(let m=0;m<xi;m++){let c=p+m*4,l=r.u16(c),u=r.u16(c+2);l!==0&&u!==0&&s.push({recipe:i,entry:p,offset:c,itemId:l,quantity:u})}},o=Oe(r,e);for(let[i,{offset:p,count:m}]of Object.entries(o))for(let c=0;c<m;c++){let l=p+c*X;n(`Create: ${Bi(i,r.u16(l+2))}`,l+4)}let t=Da(r,e);for(let[i,p]of[["blademaster","WepBMID"],["gunner","WepGunID"]]){let{offset:m,count:c}=t[i];for(let l=1;l<c;l++){let u=W(p,l)??`${i} ${l}`;n(`Upgrade from: ${u}`,m+l*J)}}return s}function vn(a,e,r,s,n){let o=[],t=a.map(l=>l.itemId),i=[];if(r.materials){let l=a.map(b=>({slot:b,tier:e.get(b.itemId)})).filter(b=>b.tier!==void 0),u=$(l,b=>V(b.tier),b=>b.slot.itemId,s.materials);i=l.map((b,v)=>({...b,itemId:u[v]}));let d=Ti(i,s.materials),y=new Map(i.map(b=>[b.slot,b.itemId]));a.forEach((b,v)=>t[v]=y.get(b)??b.itemId),o.push("Each material is replaced by another first found at the same rank and star level.",`${a.length-l.length} of ${a.length} slots keep their material: no quest, monster or gathering source for it was found (shops, combining, tickets).`,d>0?`${d} recipes still list one material twice.`:"No recipe lists the same material twice.")}let p=a.map(l=>l.quantity);if(r.amountSpread!==null){let l=Gi(a),u=r.amountSpread;a.forEach((d,y)=>{let b=l.get(t[y])/l.get(d.itemId),v=1-u+s.amounts.float()*2*u;p[y]=Ei(Math.round(d.quantity*b*v),1,r.maxQuantity)}),o.push(`Quantities are rescaled to each material's usual amount in recipes, then varied by up to ${Math.round(u*100)}%.`)}let m=n.eboot(),c=a.map((l,u)=>(m.writeUInt16LE(t[u],l.offset),m.writeUInt16LE(p[u],l.offset+2),{where:l.recipe,text:`${I(t[u])} x${p[u]} (was ${I(l.itemId)} x${l.quantity})`}));return{report:{title:"Crafting and upgrade materials",notes:o,lines:c},assigned:i}}function Ei(a,e,r){return Math.min(r,Math.max(e,a))}function Gi(a){let e=new Map;for(let s of a){let n=e.get(s.itemId);n?n.push(s.quantity):e.set(s.itemId,[s.quantity])}let r=new Map;for(let[s,n]of e)n.sort((o,t)=>o-t),r.set(s,n[Math.floor(n.length/2)]);return r}function Ti(a,e){let r=new Map,s=new Map,n=(i,p,m)=>{let c=i.get(p);c?c.push(m):i.set(p,[m])};a.forEach((i,p)=>{n(r,i.slot.entry,p),n(s,V(i.tier),p)});let o=(i,p,m)=>r.get(i).some(c=>c!==m&&a[c].itemId===p),t=0;for(let i of r.values())for(let p of i){let m=a[p];if(!o(m.slot.entry,m.itemId,p))continue;let c=s.get(V(m.tier)),l=!1;for(let u=0;u<200&&!l;u++){let d=c[e.int(c.length)],y=a[d];y.slot.entry===m.slot.entry||y.itemId===m.itemId||o(m.slot.entry,y.itemId,p)||o(y.slot.entry,m.itemId,d)||([m.itemId,y.itemId]=[y.itemId,m.itemId],l=!0)}l||t++}return t}function Bn(a,e){let r=[];for(let{slot:s,tier:n,itemId:o}of a){let t=e.get(o);(t===void 0||me(t)>me(n))&&r.push({recipe:s.recipe,item:I(o),needs:t?`${ge(t)}, was ${ge(n)}`:"no source"})}return r}f();var Ci=1262,kr=65535,Ri=200,Mi=32,xr=[163,7,11,153],Ai=223,Ii=[7,153,144,145,148,149,151,96,97,129];function En(a,e){let r=a.reader,s=[];for(let n=e;n+2<=r.length&&s.length<=Ri;n+=2){let o=r.u16(n);if(o===kr||o===0)return{offset:e,items:s};if(o>=Ci)return null;s.push(o)}return null}function Pa(a,e,r){let s=a.reader,n=[];for(let o=e;o+4<=s.length&&n.length<=Mi;o+=4){let t=s.u32(o);if(t===0)return n.length>=2?n:null;if(!a.isOwnVaddr(t))return null;let i=a.vaddrToOffset(t);if(i%2!==0)return null;let p=r.get(i)??En(a,i);if(!p)return null;r.set(i,p),n.push(i)}return null}function vr(a,e){return e.every((r,s)=>a[s]===r)}function Hi(a){if(a.flatMap(s=>s.items).includes(Ai))return{name:"Sphere and jewel shop",special:!0};let r=a.find(s=>s.items.length>0)?.items??[];return vr(r,xr)?{name:"Village general store",special:!1}:vr(r,xr.slice(1))?{name:"Guild Hall store",special:!1}:{name:"Peddler",special:!1}}function Gn(a){let e=a.reader,r=new Map,s=-1;for(let i=128;i+4<=e.length&&s===-1;i+=4){let p=e.u32(i);if(!a.isOwnVaddr(p))continue;let m=En(a,a.vaddrToOffset(p));if(!m||!vr(m.items,xr))continue;let c=i;for(;c-4>=128&&a.isOwnVaddr(e.u32(c-4));)c-=4;Pa(a,c,r)&&(s=c)}if(s===-1)throw new Error("lobby_task.ovl: the shop tables weren't found");let n=[];for(let i=s-4;i-4>=128&&e.u32(i)===0;){let p=i;for(;p-4>=128&&a.isOwnVaddr(e.u32(p-4));)p-=4;if(p===i||!Pa(a,p,r))break;n.unshift(p),i=p-4}for(let i=s;;){let p=Pa(a,i,r);if(!p)break;n.push(i),i+=(p.length+1)*4}let o=n.map(i=>({at:i,lists:Pa(a,i,r),name:"",special:!1})),t=new Map;for(let i of o){let{name:p,special:m}=Hi(i.lists.map(l=>r.get(l))),c=(t.get(p)??0)+1;t.set(p,c),i.name=c===1?p:`${p} ${c}`,i.special=m}return{tables:o,lists:r}}var Di=[[163,20],[7,66],[11,60],[153,80],[21,300],[22,250],[144,60],[145,160]],Li=[[7,10],[153,20]],Br=3,Pi=2;function Er(a,e){let r=new F(a),s=U("itemTable",r,e),n=T.regularItems+T.decorations,o=i=>s+i*q,t=[];for(let i=0;i+4<=q;i+=2)Di.every(([p,m])=>r.u32(o(p)+i)===m)&&t.push(i);if(t.length!==1){let i=r.bytes(o(7),q).toString("hex");throw new Error(`Couldn't confirm the item table's price field (${t.length} candidates; Potion's record is ${i}). Prices and carry limits can't be randomized on this disc yet.`)}for(let[i,p]of Li){let m=r.u8(o(i)+Br);if(m!==p)throw new Error(`The item table's carry limit for ${I(i)} reads ${m}, expected ${p}. Prices and carry limits can't be randomized on this disc yet.`)}return{base:s,count:n,priceField:t[0]}}function Fi(a,e){if(e==="all")return a.length>0?[a]:[];let r=[];for(let s of a){let n=r.filter(t=>t.some(i=>i.lists.some(p=>s.lists.includes(p)))),o=[...n.flat(),s];for(let t of n)r.splice(r.indexOf(t),1);r.push(o)}return r.sort((s,n)=>s[0].at-n[0].at)}function Ui(a,e,r,s){let n=r.mix==="each"?a:e;if(r.pool==="shop")return[...n];if(r.pool==="any")return[...s.allItems];let o=r.pool==="low"?["low"]:["low","high"],t=new Set(n);for(let[i,p]of s.bands)o.includes(p)&&t.add(i);return[...t].sort((i,p)=>i-p)}function ji(a,e,r,s,n){let o=[],t=new Map;a.forEach((_,w)=>{for(let E of _.items)o.includes(E)||o.push(E),t.has(E)||t.set(E,w)});let i=new Map,p=n.shuffle(e.filter(_=>!r.has(_))),m=new Set(o.filter(_=>r.has(_))),c=0;for(let _ of o){if(r.has(_)||p.length===0){i.set(_,_);continue}for(;c<p.length&&m.has(p[c]);)c++;let w=c<p.length?p[c++]:p[n.int(p.length)];i.set(_,w),m.add(w)}let l=p.slice(c).filter(_=>!m.has(_)),u=new Map;for(let[_,w]of i){let E=r.has(w)?-1:t.get(_);u.set(w,Math.min(E,u.get(w)??1/0))}let d=new Map(n.shuffle([...u.keys()]).map((_,w)=>[_,w])),y=new Map;[...u.keys()].sort((_,w)=>u.get(_)-u.get(w)||d.get(_)-d.get(w)).forEach(_=>y.set(_,y.size));for(let _ of l)y.set(_,y.size);let b=Math.max(1,...a.map(_=>_.items.length));return{sigma:i,contents:_=>{let w=Math.min(_,s/b),E=new Map;for(let g of a){let B=[...new Set(g.items.map(A=>i.get(A)))];if(g.items.length===0){E.set(g.offset,[]);continue}let G=g.items.length,M=w>=1?G+Math.floor((w-1)*G):Math.max(1,Math.ceil(w*G)),k=w>1?[...B,...l]:B,D=new Set([...k].sort((A,x)=>y.get(A)-y.get(x)).slice(0,M));E.set(g.offset,k.filter(A=>D.has(A)))}return E}}}function Tn(a,e){let r=[...a.lists.values()].sort((t,i)=>t.offset-i.offset),s=r[0].offset,n=Math.max(...r.map(t=>t.offset+t.items.length*2+2)),o=0;for(let t of r)o%4!==0&&(o+=2),o+=((e.get(t.offset)??t.items).length+1)*2;return{start:s,end:n,needed:o}}function Oi(a,e,r,s){let n=[...e.lists.values()].sort((d,y)=>d.offset-y.offset),o=d=>r.get(d.offset)??d.items;if(n.every(d=>o(d).length===d.items.length)){for(let d of n)o(d).forEach((y,b)=>s.writeUInt16LE(y,d.offset+b*2));return"in place"}let t=a.reader,{start:i,end:p,needed:m}=Tn(e,r),c=new Set;for(let d of n)for(let y=d.offset;y<d.offset+d.items.length*2+2;y+=2)c.add(y);for(let d=i;d<p;d+=2){let y=t.u16(d);if(!c.has(d)&&y!==0&&y!==kr)throw new Error(`lobby_task.ovl: something other than shop lists is at 0x${d.toString(16)}, so shops can't change length. Set the shop item count variation to 0.`)}if(m>p-i)throw new Error(`Shop lists need ${m} bytes but only ${p-i} are there; lower the shop item count variation.`);let l=new Map;s.fill(255,i,p);let u=i;for(let d of n){u%4!==0&&(u+=2),l.set(d.offset,u);let y=o(d);y.forEach((b,v)=>s.writeUInt16LE(b,u+v*2)),s.writeUInt16LE(kr,u+y.length*2),u+=y.length*2+2}for(let d of e.tables)d.lists.forEach((y,b)=>{s.writeUInt32LE(a.loadBase+l.get(y),d.at+b*4)});return"repacked"}function Cn(a,e,r,s,n,o){let t=a.tables.filter(k=>e.special||!k.special),i=new Set(e.keepEssentials?Ii:[]),p=[...new Set(t.flatMap(k=>k.lists.flatMap(D=>a.lists.get(D).items)))],m=Math.max(...[...a.lists.values()].map(k=>k.items.length)),c=[],l=new Map,u=0,d=Fi(t,e.mix).map(k=>{let A=[...new Set(k.flatMap(S=>S.lists))].sort((S,H)=>S-H).map(S=>a.lists.get(S)),x=[...new Set(A.flatMap(S=>S.items))],R=ji(A,Ui(x,p,e,r),i,m,s.stock),P=e.countSpread,j=P>0?1-P+s.stock.float()*2*P:1;return{group:k,plan:R,factor:j}}),y=1,b=()=>{let k=new Map;for(let{plan:D,factor:A}of d){let x=A>1?1+(A-1)*y:A;for(let[R,P]of D.contents(x))k.set(R,P)}return k};for(;;){let k=Tn(a,b());if(k.needed<=k.end-k.start||y===0)break;y=Math.max(0,Math.round((y-.05)*100)/100)}for(let[k,D]of b())l.set(k,D);for(let{group:k,plan:D}of d){let A=k.map(x=>x.name).join(" + ");for(let[x,R]of D.sigma)R!==x&&u++,c.push({where:A,text:R===x?`${I(x)} (unchanged)`:`${I(x)} -> ${I(R)}`});if(e.countSpread>0)for(let x of k){let R=x.lists.map(P=>`${a.lists.get(P).items.length}->${l.get(P).length}`);c.push({where:`${A}: items per stage`,text:`${x.name}: ${R.join(", ")}`})}}let v=Oi(o.ovl,a,l,n.overlay(o)),_=[...new Set([...l.values()].flat())].sort((k,D)=>k-D),w=[],E=[],g=[],B=r.items;if((e.priceSpread!==null||e.stackSpread!==null)&&!B)throw new Error("Shop prices and carry limits need the decrypted EBOOT");if(B){let k=n.eboot(),D=0;for(let A of _){if(A>=B.count)continue;let x=B.base+A*q,R=k.readUInt32LE(x+B.priceField),P=R;if(R===0&&(R=100*(k.readUInt8(x+Pi)+1)**2,D++),e.priceSpread!==null){let j=e.priceSpread;R=Math.max(1,Math.round(R*(1-j+s.prices.float()*2*j)))}if(R!==P&&(k.writeUInt32LE(R,x+B.priceField),E.push({where:"Prices",text:`${I(A)}: ${R}z (was ${P}z)`})),e.stackSpread!==null){let j=k.readUInt8(x+Br);if(j===0)continue;let S=e.stackSpread,H=Math.min(99,Math.max(1,Math.round(j*(1-S+s.stacks.float()*2*S))));k.writeUInt8(H,x+Br),H!==j&&g.push({where:"Carry limits",text:`${I(A)}: ${H} (was ${j})`})}}D>0&&w.push(`${D} items had no price, so they got one from their rarity: 100z \xD7 (rarity + 1)\xB2, before any variation.`),e.priceSpread!==null&&w.push(`Prices of everything shops sell vary by up to ${Math.round(e.priceSpread*100)}%. The price is the item's own, so it applies in every shop.`),e.stackSpread!==null&&w.push(`Carry limits of everything shops sell vary by up to ${Math.round(e.stackSpread*100)}% (1 to 99). They apply everywhere, not just in shops.`)}else e.pool!=="shop"&&w.push("Without the decrypted EBOOT, items that are never normally sold can't be given a price, so some may be free.");c.push(...E,...g);let G=a.tables.filter(k=>!t.includes(k)).map(k=>k.name);return{title:"Shops",notes:[`Each item a shop sells is replaced by one drawn from ${{shop:e.mix==="each"?"each shop's own items":"items any shop sells",low:"shop items and anything first found in Low Rank",high:"shop items and anything first found in Low or High Rank",any:"any item in the game"}[e.pool]}, the same in every stage of that shop.`,e.mix==="all"?"One replacement per item for all shops together.":"Each shop has its own replacements; shops that share stock lists share them.",e.keepEssentials?"Potion, Whetstone, pickaxes, bugnets, BBQ Spit, Normal S Lv1/2 and Empty Bottle stay on sale.":"No item is guaranteed to stay on sale.",e.countSpread>0?`How many items each shop sells varies by up to ${Math.round(e.countSpread*100)}% (at most ${m}); the lists were ${v==="repacked"?"rewritten and the shop tables updated":"kept in place"}.${y<1?` Shops can only grow into space others free, so growth was scaled to ${Math.round(y*100)}%.`:""}`:"Each shop sells as many items as before.",...w,`${u} items replaced.${G.length>0?` Not changed: ${G.join(", ")}.`:""}`],lines:c}}f();f();function Rn(a,e){let r=U("weaponsBlademaster",a,e),s=[];for(let n=0;n<T.weaponsBlademaster;n++){let o=r+n*Le;s.push({index:n,modelId:a.u16(o+0),rarity:a.u8(o+2),unkn1:a.u8(o+3),price:a.u32(o+4),sharpnessId:a.u8(o+8),sharpnessAmount:a.u8(o+9),attack:a.u16(o+10),defense:a.u8(o+12),affinity:a.s8(o+13),eleType:a.u8(o+14),eleValue:a.u8(o+15),statusType:a.u8(o+16),statusValue:a.u8(o+17),slots:a.u8(o+18),noteGlType:a.u8(o+19),unkn2:a.u8(o+20),sortOrder:a.u16(o+21),unkn3:a.u8(o+23)})}return s}function Mn(a,e){let r=U("weaponsGunner",a,e),s=[];for(let n=0;n<T.weaponsGunner;n++){let o=r+n*Pe;s.push({index:n,modelId:a.u16(o+0),rarity:a.u8(o+2),rangedPhysxTbl:a.u8(o+3),price:a.u32(o+4),attack:a.u16(o+8),defense:a.u8(o+10),recoilCharge:a.u8(o+11),slots:a.u8(o+12),affinity:a.s8(o+13),sortOrder:a.u16(o+14),bulletCharge:a.u8(o+16),eleType:a.u8(o+17),eleValue:a.u8(o+18),reload:a.u8(o+19),unkn1:a.u32(o+20),shotCoatings:a.u32(o+24)})}return s}var Ki=["great-sword","heavy-bowgun","hammer","lance","sword-and-shield","light-bowgun","dual-blades","long-sword","hunting-horn","gunlance","bow"];function An(a,e){let r=U("modelToWeaponType",a,e),s=[];for(let n=0;n<T.modelToWeaponType;n++){let o=a.u8(r+n);s.push(Ki[o]??null)}return s}var In=16,Ni=5,Vi=[{name:"Blademaster",names:"WepBMID",upgrade:"blademaster",create:["greatSwordLongSword","lanceGunlance","swordAndShieldDualBlades","hammerHuntingHorn"],rust:"ancientRustBlademaster"},{name:"Gunner",names:"WepGunID",upgrade:"gunner",create:["lightBowgun","heavyBowgun","bow"],rust:"ancientRustGunner"}],Hn={"great-sword":"Great Sword","long-sword":"Long Sword","sword-and-shield":"Sword and Shield","dual-blades":"Dual Blades",hammer:"Hammer","hunting-horn":"Hunting Horn",lance:"Lance",gunlance:"Gunlance","light-bowgun":"Light Bowgun","heavy-bowgun":"Heavy Bowgun",bow:"Bow"};function Dn(a,e,r,s,n){let o=new F(a),t=Oe(o,e),i=Da(o,e),p=An(o,e),m={Blademaster:Rn(o,e),Gunner:Mn(o,e)},c=n.eboot(),l=[],u=0;for(let d of Vi){let y=m[d.name],b=S=>W(d.names,S)??`${d.name} ${S}`,v=S=>p[y[S]?.modelId??-1]??null,_=S=>S.flatMap(H=>Array.from({length:t[H].count},(O,ke)=>t[H].offset+ke*X)),w=_(d.create),E=_([d.rust]),{offset:g,count:B}=i[d.upgrade],G=S=>g+S*J,M=S=>Array.from({length:Ni},(H,O)=>o.u16(G(S)+In+O*2)),k=new Set;for(let S of w)k.add(o.u16(S+2));for(let S=1;S<B;S++){let H=M(S).filter(O=>O!==0&&O<B);H.length>0&&k.add(S);for(let O of H)k.add(O)}let D=new Set(E.map(S=>o.u16(S+2))),A=[...k].filter(S=>S>0&&S<B&&!D.has(S)&&v(S)!==null).sort((S,H)=>S-H),R=$(A,S=>r==="same-type"?`${v(S)}:${y[S].rarity}`:`${y[S].rarity}`,S=>S,s),P=new Map(A.map((S,H)=>[S,R[H]])),j=S=>P.get(S)??S;for(let S of[...w,...E])c.writeUInt16LE(j(o.u16(S+2)),S+2);for(let S=1;S<B;S++){let H=Buffer.from(o.bytes(G(S),J));M(S).forEach((O,ke)=>{O!==0&&O<B&&H.writeUInt16LE(j(O),In+ke*2)}),H.copy(c,G(j(S)))}for(let S of A){let H=j(S);if(H===S)continue;u++;let O=v(S),ke=v(H);l.push({where:`${d.name}: ${Hn[O]}, rarity ${y[S].rarity+1}`,text:`${b(S)} -> ${b(H)}${ke===O?"":` (${Hn[ke]})`}`})}}return l.sort((d,y)=>d.where.localeCompare(y.where)),{title:"Weapon progression",notes:["Each line is a place in the smithy: you now get the second weapon where you used to get the first.",`The new weapon has the same rarity${r==="same-type"?" and type":" (any weapon type in the same family)"}.`,"Places keep their materials and upgrade links, so the trees keep their shape. Weapons keep their own stats and price (the zenny cost).",`${u} weapons changed places. Weapons from Ancient/Rusted shards stay put.`],lines:l}}f();f();function Ln(a,e){let r=(c,l)=>c>0&&c+l<=a.length,s=c=>r(c,2)?a.readUInt16LE(c):65535,n=c=>r(c,4)?a.readUInt32LE(c):0,o=[],t=[],i=[],p=new Set,m=(c,l)=>{for(let u=0,d=c;u<256&&s(d)!==65535&&r(d,60);u++,d+=60)p.has(d)||(p.add(d),l.push({offset:d,monsterId:a.readUInt16LE(d),quantity:a[d+4],power:a[d+5]}))};if(e.largeMonPtr!==0)for(let c=0,l=e.largeMonPtr;c<256&&!(!r(l,16)||a.readUInt16LE(l)===0);c++,l+=16){let u=n(l+8);for(let d=0,y=u;u!==0&&d<256&&s(y)!==65535;d++,y+=4)p.has(y)||(p.add(y),t.push({offset:y,monsterId:a.readUInt16LE(y)}));m(n(l+12),o)}if(e.smallMonPtr!==0)for(let c=0,l=e.smallMonPtr;c<256&&!(!r(l,4)||a.readUInt16LE(l)===0);c++,l+=4)for(let u=0,d=n(l);u<256&&!(!r(d,16)||a.readUInt32LE(d)===0);u++,d+=16)m(n(d+12),i);return{large:o,loads:t,small:i}}var $i=[[1,37,42],[11,41,49],[2,36,71],[6,38],[20,39],[78,40],[14,43],[26,44],[15,45],[21,46],[17,47],[48,86],[67,87],[7,50],[51,84],[52,85],[53,89],[54,60],[65,64],[27,28,31,77]],jn=new Map;for(let a of $i)for(let e of a)jn.set(e,a);var qi={16:2,17:3,18:4,19:5,20:6,21:11,31:30};function Fn(a){return qi[a]??a}function On(a){let e=[];for(let r of a){let s=ce(r.parsed);s&&e.push({quest:r,tier:s,spawns:Ln(r.file.payload,r.parsed.header)})}return e}var Xi=a=>[...new Set(a)];function Kn(a,e,r,s,n){let o=new Map,t=new Map;for(let{quest:l,tier:u,spawns:d}of a){let y=Fn(l.parsed.header.map);for(let{monsterId:b}of d.large)(o.get(y)??o.set(y,new Set).get(y)).add(b),(t.get(b)??t.set(b,new Set).get(b)).add(u.band)}let i=[],p=new Map,m=0;for(let{quest:l,tier:u,spawns:d}of a){let y=Xi(d.large.map(g=>g.monsterId));if(y.length===0)continue;if(e!=="variants"&&y.length>1){m++;continue}let b=o.get(Fn(l.parsed.header.map))??new Set,v=new Set,_=new Map;for(let g of y){let G=(e==="variants"?(jn.get(g)??[g]).filter(k=>k===g||b.has(k)):[...b].filter(k=>e==="any"||t.get(k)?.has(u.band))).filter(k=>!v.has(k)).sort((k,D)=>k-D),M=G.length>1?G[r.int(G.length)]:G[0]??g;v.add(M),M!==g&&_.set(g,M)}if(_.size===0)continue;let w=s.quest(l);for(let{offset:g,monsterId:B}of[...d.large,...d.loads]){let G=_.get(B);G!==void 0&&w.writeUInt16LE(G,g)}let E=_.get(w.readUInt16LE(112));E!==void 0&&w.writeUInt16LE(E,112),p.set(l.index,_);for(let[g,B]of _)i.push({where:ue(l),text:`${Z(B)} (was ${Z(g)})`})}let c=[e==="variants"?"Each large monster became one of its variants, on maps where that variant is found.":`Each large monster became any large monster found on the quest's map${e==="rank"?" at the quest's rank":""}.`,"Quest text, and any monster in the quest's script, still names the old monster."];return m>0&&c.push(`${m} quests with more than one kind of large monster were left alone.`),{report:{title:"Quest monsters",notes:c,lines:i},questsAfter:n.map(l=>{let u=p.get(l.index);return u?{...l.parsed,largeMonsters:l.parsed.largeMonsters.map(d=>({...d,monsterId:u.get(d.monsterId)??d.monsterId}))}:l.parsed})}}var Un=a=>a.parsed.header.rank===0?0:1;function Nn(a,e,r,s){let n=p=>e.range==="rank"?`${Un(p.quest)}:${p.tier.band}`:`${Un(p.quest)}`,o=new Map;for(let p of a)for(let{power:m}of p.spawns.large){let[c,l]=o.get(n(p))??[m,m];o.set(n(p),[Math.min(c,m),Math.max(l,m)])}let t=[];for(let p of a){let[m,c]=o.get(n(p))??[0,0];for(let l of p.spawns.large){let u=r.int(e.spread*2+1)-e.spread,d=Math.min(c,Math.max(m,l.power+u));if(d===l.power)continue;let y=s.quest(p.quest);y[l.offset+5]=d,t.push({where:ue(p.quest),text:`${Z(y.readUInt16LE(l.offset))}: level ${d} (was ${l.power})`})}}let i=[...o].map(([p,[m,c]])=>{let[l,u]=p.split(":");return`table set ${l}${u?`, ${Ga[u]}`:""}: ${m}-${c}`}).join("; ");return{title:"Monster difficulty",notes:[`Large monsters moved up to ${e.spread} difficulty levels (the row of the quest's HP, attack and defense multipliers).`,`Levels stay within those quests use: ${i}.`],lines:t}}var Gr=99;function Vn(a,e,r,s){let n=1;for(let t of a)for(let{quantity:i}of t.spawns.small)i<Gr&&(n=Math.max(n,i));let o=[];for(let t of a)for(let i of t.spawns.small){if(i.quantity===0||i.quantity>=Gr)continue;let p=1-e+2*e*r.float(),m=Math.min(n,Math.max(1,Math.round(i.quantity*p)));m!==i.quantity&&(s.quest(t.quest)[i.offset+4]=m,o.push({where:ue(t.quest),text:`${Z(i.monsterId)} x${m} (was x${i.quantity})`}))}return{title:"Small monster counts",notes:[`Counts moved by up to ${Math.round(e*100)}%, between 1 and ${n} (the most any quest has). Counts of 0 and ${Gr} or more are unchanged.`],lines:o}}f();f();var zn={loadBase:161850752,monsterChunks:163265568},we=90,Fa=464,Ua=268,Tr=256,Wn=272,Se=10;var Ji=32,Cr=["cut","bash","shot","fire","water","ice","thunder","dragon","ko"];function Zi(a,e){let r={};return Cr.forEach((s,n)=>{r[s]=a.reader.u8(e+1+n)}),{lead:a.reader.u8(e),values:r}}function $n(a,e){let r=a.reader,s=[];for(let n=e;;n+=Se){if(n+2>r.length)return null;if(r.u16(n)===0)return s.length>0?s:null;if(n+Se>r.length||s.length>=Ji)return null;s.push(Zi(a,n))}}var Qi=a=>a>=142606336&&a<167772160;function Yi(a,e){let r=a.reader.f32(e+64);return r>.01&&r<50?Qi(a.reader.u32(e+Ua)):!1}function qn(a,e=a.reader.length){let r=zn.monsterChunks-zn.loadBase,s=we*Fa,n=12,o=i=>{let p=r+i;if(p<0||p+s>a.reader.length)return-1;let m=0;for(let c=0;c<we;c++)if(!Yi(a,p+c*Fa)&&++m>n)return-1;return we-m},t=null;for(let i=0;i<=e;i+=4){for(let p of i===0?[0]:[i,-i]){let m=o(p);m>(t?.score??-1)&&(t={shift:p,score:m})}if(t?.score===we)break}return t?{offset:r+t.shift,shift:t.shift}:null}f();var Xn={$comment:["Presentation for monsters extracted from the disc (vallode/mhfu-blacksmith#35): the site name,","the data/monsters file and, per committed hitzone part and drop group, the disc slot it shows.","hitzones: part -> [table, row] in the emChunk HitzoneTbl list. drops: rank label -> group label",'-> "kind/rank", kind body|tail|shiny|capture|break:<type>, rank one of the disc slots.',"Generated by matching the committed data against the EU disc, then reviewed: parts matched by","value one-to-one per monster (11 rows by closest values, listed in the PR); drop groups by the",'label rules in README "Monster overlays", break parts by exact-list votes. Groups and parts left',"out have no unambiguous disc slot and stay as committed. Fatalis's two horn breaks (1 and 2) have","identical lists, so votes can't tell them apart; as for Crimson and White Fatalis, the break table","(monsters/breaks.ts) breaks 2 on part 5's 1st flinch and 1 on its 2nd, so 1st horn is 2."],monsters:[{id:35,name:"Giaprey",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:77,name:"Giadrome",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"1-2 star":{"body carves (x2)":"body/unranked",capture:"capture/unranked"},"low rank":{"body carves (x2)":"body/low",capture:"capture/low"},"high rank":{"body carves (x2)":"body/high",capture:"capture/high"}}},{id:16,name:"Velociprey",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:27,name:"Velocidrome",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"1-2 star":{"body carves (x2)":"body/unranked",capture:"capture/unranked"},"low rank":{"body carves (x2)":"body/low",capture:"capture/low"},"high rank":{"body carves (x2)":"body/high",capture:"capture/high"}}},{id:13,name:"Genprey",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:28,name:"Gendrome",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"1-2 star":{"body carves (x2)":"body/unranked",capture:"capture/unranked"},"low rank":{"body carves (x2)":"body/low",capture:"capture/low"},"high rank":{"body carves (x2)":"body/high",capture:"capture/high"}}},{id:30,name:"Ioprey",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:31,name:"Iodrome",file:"monsters/bird-wyvern.json",hitzones:{all:[0,0]},drops:{"low rank":{"body carves (x2)":"body/low",capture:"capture/low"},"high rank":{"body carves (x2)":"body/high",capture:"capture/high"}}},{id:6,name:"Yian Kut-Ku",file:"monsters/bird-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","break ears":"break:1/unranked","shiny drop : sonic, doesn't work when rage":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","break ears":"break:1/low","shiny drop : sonic, doesn't work when rage":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break ears":"break:1/high","shiny drop : sonic, doesn't work when rage":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break ears":"break:1/g","shiny drop : sonic, doesn't work when rage":"shiny/g",capture:"capture/g"}}},{id:38,name:"Blue Yian Kut-Ku",file:"monsters/bird-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low rank":{"body carves (x3)":"body/low","break ears":"break:1/low","shiny drop : sonic, doesn't work when rage":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break ears":"break:1/high","shiny drop : sonic, doesn't work when rage":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break ears":"break:1/g","shiny drop : sonic, doesn't work when rage":"shiny/g",capture:"capture/g"}}},{id:78,name:"Yian Garuga",file:"monsters/bird-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],torso:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low rank":{"body carve (x3)":"body/low","tail carve (x1)":"tail/low","break ears":"break:2/low","break beak":"break:1/low","break wings":"break:4/low","break back":"break:3/low","shiny drop : pitfall trapped in rage mode":"shiny/low",capture:"capture/low"},"high rank":{"break ears":"break:2/high","break beak":"break:1/high","break wings":"break:4/high","break back":"break:3/high"},"g rank":{"body carve (x3)":"body/g","tail carve (x1)":"tail/g","break ears":"break:2/g","break beak":"break:1/g","break wings":"break:4/g","break back":"break:3/g","shiny drop : pitfall trapped in rage mode":"shiny/g",capture:"capture/g"}}},{id:40,name:"Scarred Yian Garuga",file:"monsters/bird-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],torso:[0,3],leg:[0,6],tail:[0,4],wing:[0,5]}},{id:20,name:"Gypceros",file:"monsters/bird-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"1-2 star guild":{"body carve (x3)":"body/unranked","shiny drop : when playing dead":"shiny/unranked","break head":"break:1/unranked",capture:"capture/unranked"},"low-rank":{"body carve (x3)":"body/low","shiny drop : when playing dead":"shiny/low","break head":"break:1/low",capture:"capture/low"},"high-rank":{"body carve (x3)":"body/high","break head":"break:1/high",capture:"capture/high"},"g-rank":{"body carve (x3)":"body/g","break head":"break:1/g",capture:"capture/g"}}},{id:39,name:"Purple Gypceros",file:"monsters/bird-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low rank":{"body carve (x3)":"body/low","shiny drop : when playing dead":"shiny/low","break head":"break:1/low",capture:"capture/low"},"high rank":{"body carve (x3)":"body/high","break head":"break:1/high",capture:"capture/high"},"g rank":{"body carve (x3)":"body/g","break head":"break:1/g",capture:"capture/g"}}},{id:82,name:"Hypnocatrice",file:"monsters/bird-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"high rank":{"body carve (x3)":"body/high","break head":"break:1/high","shiny drop : put hypnoc to sleep":"shiny/high",capture:"capture/high"},"g rank":{"body carve (x3)":"body/g","break head":"break:1/g","shiny drop : put hypnoc to sleep":"shiny/g",capture:"capture/g"}}},{id:66,name:"Hermitaur",file:"monsters/carapaceon.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:48,name:"Daimyo Hermitaur",file:"monsters/carapaceon.json",hitzones:{head:[0,0],body:[0,1],shell:[0,2],leg:[0,3],claw:[0,4],arm:[0,5]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","break shell":"break:1/unranked","break claw":"break:2/unranked","shiny drop : finishes eating without noticing hunter":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","break shell":"break:1/low","break claw":"break:2/low","shiny drop : finishes eating without noticing hunter":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break shell":"break:1/high","break claw":"break:2/high","shiny drop : finishes eating without noticing hunter":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break shell":"break:1/g","break claw":"break:2/g","shiny drop : finishes eating without noticing hunter":"shiny/g",capture:"capture/g"}}},{id:86,name:"Plum Daimyo Hermitaur",file:"monsters/carapaceon.json",hitzones:{head:[0,0],body:[0,1],shell:[0,2],leg:[0,3],claw:[0,4],arm:[0,5]},drops:{"g rank":{"body carves (x3)":"body/g","break shell":"break:1/g","break claw":"break:2/g","shiny drop : finishes eating without noticing hunter":"shiny/g",capture:"capture/g"}}},{id:73,name:"Ceanataur",file:"monsters/carapaceon.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:67,name:"Shogun Ceanataur",file:"monsters/carapaceon.json",hitzones:{head:[0,0],body:[0,1],shell:[0,2],leg:[0,3],pincer:[0,4],arm:[0,5]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","break shell - gravios skull":"break:1/unranked","break shell - brown skull":"break:2/unranked","break shell - white skull":"break:3/unranked","break claw":"break:4/unranked","shiny drop : replacing shell or finishes eating without noticing hunter":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","break shell - gravios skull":"break:1/low","break shell - brown skull":"break:2/low","break shell - white skull":"break:3/low","break claw":"break:4/low","shiny drop : replacing shell or finishes eating without noticing hunter":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break shell - gravios skull":"break:1/high","break shell - brown skull":"break:2/high","break shell - white skull":"break:3/high","break claw":"break:4/high","shiny drop : replacing shell or finishes eating without noticing hunter":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break shell - gravios skull":"break:1/g","break shell - brown skull":"break:2/g","break shell - white skull":"break:3/g","break claw":"break:4/g","shiny drop : replacing shell or finishes eating without noticing hunter":"shiny/g",capture:"capture/g"}}},{id:87,name:"Terra Shogun Ceanataur",file:"monsters/carapaceon.json",hitzones:{head:[0,0],body:[0,1],shell:[0,2],leg:[0,3],pincer:[0,4],arm:[0,5]},drops:{"g rank":{"body carves (x3)":"body/g","break claw":"break:2/g","shiny drop : replacing shell or finishes eating without noticing hunter":"shiny/g",capture:"capture/g"}}},{id:55,name:"Shen Gaoren",file:"monsters/carapaceon.json",hitzones:{head:[0,0],body:[0,1],shell:[0,2],leg:[0,3],claw:[0,4],arm:[0,5],"weak-point":[0,6]}},{id:33,name:"Kirin",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],body:[0,1],horn:[0,2]},drops:{"low rank":{"body carves (x2)":"body/low"},"high rank":{"body carves (x2)":"body/high"},"g rank":{"body carves (x2)":"body/g"}}},{id:54,name:"Kushala Daora",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],belly:[0,1],back:[0,2],wing:[0,6],"front-legs":[0,4],"hind-legs":[0,5],tail:[0,3]}},{id:60,name:"Rusted Kushala Daora",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],belly:[0,1],back:[0,2],wing:[0,6],"front-legs":[0,4],"hind-legs":[0,5],tail:[0,3]}},{id:59,name:"Chameleos",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],"belly-chest":[0,1],back:[0,2],wing:[0,5],"front-legs":[0,3],"hind-legs":[0,4],tail:[0,6]},drops:{"low rank":{"body carves (x4)":"body/low","tail carves (x1)":"tail/low","break horn":"break:0/low","shiny drop : sonic during its attacks":"shiny/low"},"high rank":{"body carves (x4)":"body/high","tail carves (x1)":"tail/high","break horn":"break:0/high","shiny drop : sonic during its attacks":"shiny/high"},"g rank":{"body carves (x4)":"body/g","tail carves (x1)":"tail/g","break horn":"break:0/g","shiny drop : sonic during its attacks":"shiny/g"}}},{id:64,name:"Lunastra",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],belly:[0,1],back:[0,2],wing:[0,6],"front-legs":[0,4],"hind-legs":[0,5],tail:[0,3]},drops:{"low rank":{"body carves (x4)":"body/low","tail carves (x1)":"tail/low","break horn":"break:0/low","break wings":"break:1/low","shiny drop : force it into rage mode or reactivating fire aura":"shiny/low"},"high rank":{"body carves (x4)":"body/high","tail carves (x1)":"tail/high","break horn":"break:0/high","break wings":"break:1/high","shiny drop : force it into rage mode or reactivating fire aura":"shiny/high"}}},{id:65,name:"Teostra",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],belly:[0,1],back:[0,2],wing:[0,6],"front-legs":[0,4],"hind-legs":[0,5],tail:[0,3]},drops:{"low rank":{"body carves (x4)":"body/low","tail carves (x1)":"tail/low","break horn":"break:0/low","break wings":"break:1/low","shiny drop : force it into rage mode or reactivating fire aura":"shiny/low"},"high rank":{"body carves (x4)":"body/high","tail carves (x1)":"tail/high","break horn":"break:0/high","break wings":"break:1/high","shiny drop : force it into rage mode or reactivating fire aura":"shiny/high"},"g rank":{"body carves (x4)":"body/g","tail carves (x1)":"tail/g","break horn":"break:0/g","break wings":"break:1/g","shiny drop : force it into rage mode or reactivating fire aura":"shiny/g"}}},{id:7,name:"Lao-Shan Lung",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,5],back:[0,2],"weak-spot":[0,3],shoulder:[0,4],leg:[0,6],tail:[0,2]},drops:{"low rank":{"break horn":"break:0/low","break head":"break:1/low","break back":"break:2/low","break left shoulder":"break:3/low"}}},{id:50,name:"Ashen Lao-Shan Lung",file:"monsters/elder-dragon.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,5],back:[0,2],"weak-spot":[0,3],shoulder:[0,4],leg:[0,6],tail:[0,2]}},{id:58,name:"Yama Tsukami",file:"monsters/elder-dragon.json",hitzones:{eye:[0,2],mouth:[0,4],back:[0,1],belly:[0,3],feeler:[0,5],tentacle:[0,6],head:[0,0]},drops:{"g rank":{"break tentacles":"break:0/g"}}},{id:2,name:"Fatalis",file:"monsters/elder-dragon.json",hitzones:{face:[0,0],head:[0,1],"back-tail":[0,2],neck:[0,3],wings:[0,5],"belly-legs":[0,6],chest:[0,4]},drops:{"high rank":{"break 1st horn":"break:2/high","break 2nd horn":"break:1/high","break eye":"break:0/high","break wing":"break:3/high","break chest":"break:4/high"},"g rank":{"break 1st horn":"break:2/g","break 2nd horn":"break:1/g","break eye":"break:0/g","break wing":"break:3/g","break chest":"break:4/g"}}},{id:36,name:"Crimson Fatalis",file:"monsters/elder-dragon.json",hitzones:{face:[0,0],head:[0,1],"back-tail":[0,2],neck:[0,3],wings:[0,5],"belly-legs":[0,6],chest:[0,4]},drops:{"high rank":{"break 1st horn":"break:2/high","break 2nd horn":"break:1/high","break eye":"break:0/high","break wing":"break:3/high","break chest":"break:4/high"},"g rank":{"break 1st horn":"break:2/g","break 2nd horn":"break:1/g","break eye":"break:0/g","break wing":"break:3/g","break chest":"break:4/g"}}},{id:71,name:"White Fatalis",file:"monsters/elder-dragon.json",hitzones:{face:[0,0],head:[0,1],"back-tail":[0,2],neck:[0,3],wings:[0,5],"belly-legs":[0,6],chest:[0,4]},drops:{"high rank":{"break 1st horn":"break:2/high","break 2nd horn":"break:1/high","break eye":"break:0/high","break wing":"break:3/high","break chest":"break:4/high"},"g rank":{"break 1st horn":"break:2/g","break 2nd horn":"break:1/g","break eye":"break:0/g","break wing":"break:3/g","break chest":"break:4/g"}}},{id:63,name:"Remobra",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],wings:[0,1],other:[0,2]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:1,name:"Rathian",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","tail carves (x1)":"tail/unranked","break head":"break:1/unranked","break wing":"break:2/unranked","shiny drop : awoken from sleep or got trapped":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","break head":"break:1/low","break wing":"break:2/low","shiny drop : awoken from sleep or got trapped":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","break head":"break:1/high","break wing":"break:2/high","shiny drop : awoken from sleep or got trapped":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","break head":"break:1/g","break wing":"break:2/g","shiny drop : awoken from sleep or got trapped":"shiny/g",capture:"capture/g"}}},{id:37,name:"Pink Rathian",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"low rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","break head":"break:1/low","break wing":"break:2/low","shiny drop : awoken from sleep or got trapped":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","break head":"break:1/high","break wing":"break:2/high","shiny drop : awoken from sleep or got trapped":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","break head":"break:1/g","break wing":"break:2/g","shiny drop : awoken from sleep or got trapped":"shiny/g",capture:"capture/g"}}},{id:42,name:"Gold Rathian",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","break head":"break:1/high","break wing":"break:2/high","shiny drop : awoken from sleep or flashed while flying":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","break head":"break:1/g","break wing":"break:2/g","shiny drop : awoken from sleep or flashed while flying":"shiny/g",capture:"capture/g"}}},{id:11,name:"Rathalos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","tail carves (x1)":"tail/unranked","break head":"break:1/unranked","break wing":"break:2/unranked","shiny drop : awoken from sleep or flashed while flying":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","break head":"break:1/low","break wing":"break:2/low","shiny drop : awoken from sleep or flashed while flying":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","break head":"break:1/high","break wing":"break:2/high","shiny drop : awoken from sleep or flashed while flying":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","break head":"break:1/g","break wing":"break:2/g","shiny drop : awoken from sleep or flashed while flying":"shiny/g",capture:"capture/g"}}},{id:49,name:"Azure Rathalos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"low rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","break head":"break:1/low","break wing":"break:2/low","shiny drop : awoken from sleep or flashed while flying":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","break head":"break:1/high","break wing":"break:2/high","shiny drop : awoken from sleep or flashed while flying":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","break head":"break:1/g","break wing":"break:2/g","shiny drop : awoken from sleep or flashed while flying":"shiny/g",capture:"capture/g"}}},{id:41,name:"Silver Rathalos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","break head":"break:1/high","break wing":"break:2/high","shiny drop : awoken from sleep or flashed while flying":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","break head":"break:1/g","break wing":"break:2/g","shiny drop : awoken from sleep or flashed while flying":"shiny/g",capture:"capture/g"}}},{id:15,name:"Khezu",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","break head/back":"break:1/unranked","shiny drop : drip acid from ceiling":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","break head/back":"break:1/low","shiny drop : drip acid from ceiling":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break head/back":"break:1/high","shiny drop : drip acid from ceiling":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break head/back":"break:1/g","shiny drop : drip acid from ceiling":"shiny/g",capture:"capture/g"}}},{id:45,name:"Red Khezu",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"low rank":{"body carves (x3)":"body/low","break head/back":"break:1/low","shiny drop : drip acid from ceiling":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break head/back":"break:1/high","shiny drop : drip acid from ceiling":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break head/back":"break:1/g","shiny drop : drip acid from ceiling":"shiny/g",capture:"capture/g"}}},{id:22,name:"Basarios",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],chest:[0,3],"chest-broken":[1,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","break stomach":"break:1/low","shiny drop : awoken from rock mimic or awoken from sleep":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","break stomach":"break:1/high","shiny drop : awoken from rock mimic or awoken from sleep":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","break stomach":"break:1/g","shiny drop : awoken from rock mimic or awoken from sleep":"shiny/g",capture:"capture/g"}}},{id:17,name:"Gravios",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],chest:[0,3],"chest-broken":[1,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low-rank":{"body carves (x4)":"body/low","tail carves (x2)":"tail/low","capture rewards":"capture/low","shiny drops":"shiny/low","break stomach":"break:1/low"},"high-rank":{"body carves (x4)":"body/high","tail carves (x2)":"tail/high","capture rewards":"capture/high","shiny drops":"shiny/high","break stomach":"break:1/high"},"g-rank":{"body carves (x4)":"body/g","tail carves (x2)":"tail/g","capture rewards":"capture/g","shiny drops":"shiny/g","break stomach":"break:1/g"}}},{id:47,name:"Black Gravios",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],chest:[0,3],"chest-broken":[1,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low-rank":{"body carves (x4)":"body/low","tail carves (x2)":"tail/low","capture rewards":"capture/low","shiny drops":"shiny/low","break stomach":"break:1/low"},"high-rank":{"body carves (x4)":"body/high","tail carves (x2)":"tail/high","capture rewards":"capture/high","shiny drops":"shiny/high","break stomach":"break:1/high"},"g-rank":{"body carves (x4)":"body/g","tail carves (x2)":"tail/g","capture rewards":"capture/g","shiny drops":"shiny/g","break stomach":"break:1/g"}}},{id:26,name:"Monoblos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low-rank":{"body carves (x4)":"body/low","tail carves (x2)":"tail/low","capture rewards":"capture/low","shiny drops":"shiny/low","break horn":"break:1/low"},"high-rank":{"body carves (x4)":"body/high","tail carves (x2)":"tail/high","capture rewards":"capture/high","shiny drops":"shiny/high","break horn":"break:1/high"}}},{id:44,name:"White Monoblos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low-rank":{"body carves (x4)":"body/low","tail carves (x2)":"tail/low","capture rewards":"capture/low","shiny drops":"shiny/low","break horn":"break:1/low"},"high-rank":{"body carves (x4)":"body/high","tail carves (x2)":"tail/high","capture rewards":"capture/high","shiny drops":"shiny/high","break horn":"break:1/high"}}},{id:14,name:"Diablos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],wings:[0,2],belly:[0,3],tail:[0,4],"wing-membrane":[0,5],leg:[0,6]},drops:{"low-rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","capture rewards":"capture/low","shiny drops":"shiny/low","break horns":"break:1/low"},"high-rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","capture rewards":"capture/high","shiny drops":"shiny/high","break horns":"break:1/high"},"g-rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","capture rewards":"capture/g","shiny drops":"shiny/g","break horns":"break:1/g"}}},{id:43,name:"Black Diablos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],wings:[0,2],belly:[0,3],tail:[0,4],"wing-membrane":[0,5],leg:[0,6]},drops:{"low rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","capture rewards":"capture/low","shiny drops":"shiny/low","break horns":"break:1/low"},"high rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","capture rewards":"capture/high","shiny drops":"shiny/high","break horns":"break:1/high"},"g rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","capture rewards":"capture/g","shiny drops":"shiny/g","break horns":"break:1/g"}}},{id:75,name:"Tigrex",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,2],back:[0,3],tail:[0,4],"front-legs":[0,5],"hind-legs":[0,6]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","tail carves (x1)":"tail/unranked","capture rewards":"capture/unranked","shiny drops":"shiny/unranked","break head":"break:2/unranked","break claw":"break:1/unranked"},"low-rank":{"body carves (x3)":"body/low","tail carves (x1)":"tail/low","capture rewards":"capture/low","shiny drops":"shiny/low","break head":"break:2/low","break claw":"break:1/low"},"high-rank":{"body carves (x3)":"body/high","tail carves (x1)":"tail/high","capture rewards":"capture/high","shiny drops":"shiny/high","break head":"break:2/high","break claw":"break:1/high"},"g-rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","capture rewards":"capture/g","shiny drops":"shiny/g","break head":"break:2/g","break claw":"break:1/g"}}},{id:81,name:"Nargacuga",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],"head-rage":[1,0],neck:[0,1],belly:[0,2],back:[0,3],tail:[0,4],"front-legs":[0,5],"hind-legs":[0,6]},drops:{"high-rank":{"body carves (x3)":"body/high","capture rewards":"capture/high","shiny drops":"shiny/high","break head":"break:2/high","break wings":"break:1/high","break tail":"break:3/high"},"g-rank":{"body carves (x3)":"body/g","tail carves (x1)":"tail/g","capture rewards":"capture/g","shiny drops":"shiny/g","break head":"break:2/g","break wings":"break:1/g","break tail":"break:3/g"}}},{id:76,name:"Akantor",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,2],back:[0,3],tail:[0,4],"front-legs":[0,5],"hind-legs":[0,6]},drops:{"high rank":{"body carves (x4)":"body/high","tail carves (x2)":"tail/high","shiny drops":"shiny/high","break fangs":"break:1/high","break claws":"break:0/high","break spikes - back":"break:3/high"}}},{id:88,name:"Ukanlos",file:"monsters/flying-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,2],"front-legs":[0,3],"hind-legs":[0,4],back:[0,5],tail:[0,6]},drops:{"g rank":{"body carves (x4)":"body/g","tail carves (x2) - cut when hp < 25%":"tail/g","break head":"break:1/g","break dorsal fin":"break:3/g","break chest - requires fire element":"break:2/g"}}},{id:69,name:"Anteka",file:"monsters/herbivore.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:70,name:"Popo",file:"monsters/herbivore.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:3,name:"Kelbi",file:"monsters/herbivore.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:4,name:"Mosswine",file:"monsters/herbivore.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:12,name:"Aptonoth",file:"monsters/herbivore.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:25,name:"Apceros",file:"monsters/herbivore.json",hitzones:{head:[0,0],body:[0,1]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:9,name:"Felyne",file:"monsters/lynian.json",hitzones:{all:[0,0]}},{id:23,name:"Melynx",file:"monsters/lynian.json",hitzones:{all:[0,0]},drops:{"1-2 star guild":{"shiny drop":"shiny/unranked"},"low-rank":{"shiny drop":"shiny/low"},"high-rank":{"shiny drop":"shiny/high"},"g-rank":{"shiny drop":"shiny/g"}}},{id:57,name:"Shakalaka",file:"monsters/lynian.json",hitzones:{all:[0,0]},drops:{"low rank":{"body carves (x1)":"body/low","shiny drop":"shiny/low"},"high rank":{"body carves (x1)":"body/high","shiny drop":"shiny/high"},"g rank":{"body carves (x1)":"body/g","shiny drop":"shiny/g"}}},{id:79,name:"King Shakalaka",file:"monsters/lynian.json",hitzones:{all:[0,0]},drops:{"high rank":{"body carves (x2)":"body/high","shiny drop : stagger during taunt":"shiny/high"},"g rank":{"body carves (x2)":"body/g","shiny drop : stagger during taunt":"shiny/g"}}},{id:19,name:"Vespoid",file:"monsters/neopteron.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:80,name:"Vespoid Queen",file:"monsters/neopteron.json",hitzones:{all:[0,0]}},{id:24,name:"Hornetaur",file:"monsters/neopteron.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:56,name:"Great Thunderbug",file:"monsters/neopteron.json",hitzones:{all:[0,0]},drops:{"low-rank":{"shiny drop ( killed )":"shiny/low"},"high-rank":{"shiny drop ( killed )":"shiny/high"},"g-rank":{"shiny drop ( killed )":"shiny/g"}}},{id:5,name:"Bullfango",file:"monsters/pelagus.json",hitzones:{all:[0,0]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:68,name:"Bulldrome",file:"monsters/pelagus.json",hitzones:{all:[0,0]},drops:{"1-2 star":{"body carves (x3)":"body/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g",capture:"capture/g"}}},{id:62,name:"Conga",file:"monsters/pelagus.json",hitzones:{head:[0,0],other:[0,1]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:52,name:"Congalala",file:"monsters/pelagus.json",hitzones:{head:[0,0],torso:[0,3],"front-leg":[0,1],"hind-leg":[0,2],tail:[0,4]},drops:{"1-2 star":{"body carves (x3)":"body/unranked","break head":"break:1/unranked","break claw":"break:2/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","break head":"break:1/low","break claw":"break:2/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break head":"break:1/high","break claw":"break:2/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break head":"break:1/g","break claw":"break:2/g",capture:"capture/g"}}},{id:85,name:"Emerald Congalala",file:"monsters/pelagus.json",hitzones:{head:[0,0],body:[0,3],"front-legs":[0,1],"hind-legs":[0,2],tail:[0,4]},drops:{"g rank":{"body carves (x3)":"body/g","break head":"break:1/g","break claw":"break:2/g",capture:"capture/g"}}},{id:61,name:"Blango",file:"monsters/pelagus.json",hitzones:{head:[0,0],other:[0,1]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:51,name:"Blangonga",file:"monsters/pelagus.json",hitzones:{head:[0,0],body:[0,3],"front-legs":[0,1],"hind-legs":[0,2],tail:[0,4]},drops:{"1-2 star rank":{"body carves (x3)":"body/unranked","break fang":"break:1/unranked","break tail":"break:2/unranked","shiny drop : finishes eating without noticing hunter":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x3)":"body/low","break fang":"break:1/low","break tail":"break:2/low","shiny drop : finishes eating without noticing hunter":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break fang":"break:1/high","break tail":"break:2/high","shiny drop : finishes eating without noticing hunter":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break fang":"break:1/g","break tail":"break:2/g","shiny drop : finishes eating without noticing hunter":"shiny/g",capture:"capture/g"}}},{id:84,name:"Copper Blangonga",file:"monsters/pelagus.json",hitzones:{head:[0,0],body:[0,3],"front-legs":[0,1],"hind-legs":[0,2],tail:[0,4]},drops:{"g rank":{"body carves (x3)":"body/g","break fang":"break:1/g","break tail":"break:2/g","shiny drop : finishes eating without noticing hunter":"shiny/g",capture:"capture/g"}}},{id:53,name:"Rajang",file:"monsters/pelagus.json",hitzones:{head:[0,0],body:[0,3],"front-legs":[0,1],"hind-legs":[0,2],tail:[0,4]},drops:{"low rank":{"body carves (x3)":"body/low","break horn":"break:1/low","break tail":"break:2/low",capture:"capture/low"},"high rank":{"body carves (x3)":"body/high","break horn":"break:1/high","break tail":"break:2/high",capture:"capture/high"},"g rank":{"body carves (x3)":"body/g","break horn":"break:1/g","break tail":"break:2/g",capture:"capture/g"}}},{id:89,name:"Furious Rajang",file:"monsters/pelagus.json",hitzones:{head:[0,0],body:[0,3],"front-legs":[0,1],"hind-legs":[0,2],tail:[0,4]}},{id:34,name:"Cephalos",file:"monsters/piscine-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low-rank":{"body carves (x1)":"body/low"},"high-rank":{"body carves (x1)":"body/high"},"g-rank":{"body carves (x1)":"body/g"}}},{id:8,name:"Cephadrome",file:"monsters/piscine-wyvern.json",hitzones:{head:[0,0],neck:[0,1],belly:[0,3],back:[0,2],wing:[0,5],leg:[0,6],tail:[0,4]},drops:{"1-2 star guild":{"body carves (x3)":"body/unranked","break back fin":"break:1/unranked","shiny drop":"shiny/unranked",capture:"capture/unranked"},"low-rank":{"body carves (x3)":"body/low","break back fin":"break:1/low","shiny drop":"shiny/low",capture:"capture/low"},"high-rank":{"body carves (x3)":"body/high","break back fin":"break:1/high","shiny drop":"shiny/high",capture:"capture/high"}}},{id:21,name:"Plesioth",file:"monsters/piscine-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"1-2 star":{"body carves (x4)":"body/unranked","break back fin":"break:1/unranked","shiny drop : fished out, using frog as bait":"shiny/unranked",capture:"capture/unranked"},"low rank":{"body carves (x4)":"body/low","break back fin":"break:1/low","shiny drop : fished out, using frog as bait":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x4)":"body/high","break back fin":"break:1/high","shiny drop : fished out, using frog as bait":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x4)":"body/g","break back fin":"break:1/g","shiny drop : fished out, using frog as bait":"shiny/g",capture:"capture/g"}}},{id:46,name:"Green Plesioth",file:"monsters/piscine-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],wing:[0,5],leg:[0,6]},drops:{"low rank":{"body carves (x4)":"body/low","break back fin":"break:1/low","shiny drop : fished out, using frog as bait":"shiny/low",capture:"capture/low"},"high rank":{"body carves (x4)":"body/high","break back fin":"break:1/high","shiny drop : fished out, using frog as bait":"shiny/high",capture:"capture/high"},"g rank":{"body carves (x4)":"body/g","break back fin":"break:1/g","shiny drop : fished out, using frog as bait":"shiny/g",capture:"capture/g"}}},{id:83,name:"Lavasioth",file:"monsters/piscine-wyvern.json",hitzones:{head:[0,0],neck:[0,1],back:[0,2],belly:[0,3],tail:[0,4],fin:[0,5],leg:[0,6]},drops:{"g rank":{"body carves (x4)":"body/g","break face":"break:1/g","break fin":"break:2/g","shiny drop : ko-ed (hammer, hh, crag s)":"shiny/g",capture:"capture/g"}}}]};var Rr=Xn.monsters,xu=new Map(Rr.map(a=>[a.name,a]));var al=64,Jn=[4,5,6,7,8],Zn=Cr.slice(3,8),rl=[{name:"paralysis",at:0,increase:8},{name:"KO",at:10,increase:8},{name:"sleep",at:20,increase:8},{name:"poison",at:40,increase:12}];function Qn(a,e){let r=qn(a);if(!r)throw new Error("game_task.ovl: the monster table wasn't found");let s=new Set;for(let p of e){for(let m of p.largeMonsters)s.add(m.monsterId);for(let m of p.smallMonsters)for(let c of m.monsters)s.add(c.monsterId)}let n=p=>r.offset+p*Fa,o=[...s].filter(p=>p>0&&p<we).filter(p=>a.reader.u16(n(p)+Tr)>0).sort((p,m)=>p-m),t=p=>a.reader.u32(n(p)+Ua),i=new Set;for(let p=0;p<we;p++)o.includes(p)||i.add(t(p));return o.map(p=>({emId:p,offset:n(p),hitzonesShared:i.has(t(p))}))}var Mr=(a,e)=>1-e+2*e*a.float(),ea=a=>`${Math.round(a*100)}%`;function Yn(a,e,r,s,n){let o=s.overlay(n),t=[];for(let{emId:p,offset:m}of a){let c=Z(p);if(e.hpSpread!==null){let l=m+Tr,u=o.readUInt16LE(l),d=Math.min(65535,Math.max(1,Math.round(u*Mr(r.hp,e.hpSpread))));o.writeUInt16LE(d,l),t.push({where:c,text:`HP ${d} (was ${u})`})}if(e.sizeSpread!==null){let l=m+al,u=o.readFloatLE(l),d=Mr(r.size,e.sizeSpread);o.writeFloatLE(u*d,l),t.push({where:c,text:`size ${ea(d)} of normal`})}if(e.statusSpread!==null){let l=[];for(let u of rl){let d=Mr(r.status,e.statusSpread),y=m+Wn+u.at;for(let b of[y,y+u.increase]){let v=o.readUInt16LE(b);v===0||v===65535||o.writeUInt16LE(Math.min(65534,Math.max(1,Math.round(v*d))),b)}l.push(`${u.name} ${ea(d)}`)}t.push({where:c,text:`status resistance: ${l.join(", ")}`})}}let i=[];return e.hpSpread!==null&&i.push(`Base HP moved by up to ${ea(e.hpSpread)}.`),e.sizeSpread!==null&&i.push(`Base size moved by up to ${ea(e.sizeSpread)}.`),e.statusSpread!==null&&i.push(`Status resistance (the first dose, and the increase after each) moved by up to ${ea(e.statusSpread)}.`),{title:"Monster stats",notes:i,lines:t}}function sl(a,e){let r=a.reader.u32(e+Ua);if(!a.isOwnVaddr(r))return[];let s=[];for(let n=a.vaddrToOffset(r);n+4<=a.reader.length&&s.length<8;n+=4){let o=a.reader.u32(n);if(!a.isOwnVaddr(o))break;let t=a.vaddrToOffset(o),i=$n(a,t);if(!i)break;s.push({offset:t,rows:i.length})}return s}function nl(a){let e=Rr.find(s=>s.id===a),r=new Map;for(let[s,[n,o]]of Object.entries(e?.hitzones??{}))n===0&&r.set(o,[...r.get(o)??[],s]);return r}function eo(a,e,r,s,n){let o=n.ovl,t=s.overlay(n),i=new Map,p=[],m=0;for(let{emId:l,offset:u,hitzonesShared:d}of a){let y=Z(l);if(d){m++;continue}let b=sl(o,u),v=b.find(_=>i.has(_.offset));if(v){p.push({where:y,text:`shares hitzones with ${Z(i.get(v.offset))}`});continue}if(b.length!==0){for(let _ of b)i.set(_.offset,l);if(e.parts){let _=nl(l),w=[..._.keys()].sort((E,g)=>E-g);if(w.length>1){let E=r.parts.shuffle([...w]);for(let g of b){if(w.at(-1)>=g.rows)continue;let B=w.map(G=>Buffer.from(t.subarray(g.offset+G*Se+1,g.offset+(G+1)*Se)));w.forEach((G,M)=>B[w.indexOf(E[M])].copy(t,g.offset+G*Se+1))}w.forEach((g,B)=>{if(E[B]===g)return;let G=M=>_.get(M).join("/");p.push({where:y,text:`${G(g)} now takes hits like ${G(E[B])} did`})})}}if(e.elements){let _=r.elements.shuffle([0,1,2,3,4]);for(let E of b)for(let g=0;g<E.rows;g++){let B=E.offset+g*Se,G=Jn.map(M=>t[B+M]);Jn.forEach((M,k)=>t[B+M]=G[_[k]])}let w=_.map((E,g)=>E===g?null:`${Zn[g]} as ${Zn[E]} was`).filter(E=>E!==null);w.length>0&&p.push({where:y,text:`elements: ${w.join(", ")}`})}}}let c=[];return e.parts&&c.push("Weak spots: each large monster's parts traded hitzone values (cut, bash, shot, elements, KO), in every state (broken, enraged)."),e.elements&&c.push('Elements: "ice as fire was" means the monster now takes ice damage the way it took fire damage, on every part.'),m>0&&c.push(`${m} monsters share their hitzones with chunks that aren't monsters and are unchanged.`),{title:"Monster weaknesses",notes:c,lines:p}}function ol(a,e){if(e)return Er(a.eboot,a.resolver);if(!a.eboot)return null;try{return Er(a.eboot,a.resolver)}catch{return null}}function ao(){let a=[];for(let e=1;e<T.regularItems+T.decorations;e++)W("ItemID",e)!==null&&a.push(e);return a}function ro(a,e){let r=new Ca(`randomfu/${6}/${e.seed}`),s=new Ea(a),n=[],o=e["logic.tiers"],t=g=>g.map(B=>({...B,tier:Ys(B.tier,o)})),i=On(a.quests),p=a.quests.map(g=>g.parsed);if(e["questMonsters.species"]){let g=Kn(i,e["questMonsters.speciesPool"],r.fork("monster-species"),s,a.quests);n.push(g.report),p=g.questsAfter}e["questMonsters.difficulty"]&&n.push(Nn(i,{spread:e["questMonsters.difficultySpread"],range:e["questMonsters.difficultyRange"]},r.fork("monster-difficulty"),s)),e["questMonsters.smallCounts"]&&n.push(Vn(i,e["questMonsters.smallCountSpread"],r.fork("small-monster-counts"),s));let m={hpSpread:e["monsterStats.hp"]?e["monsterStats.hpSpread"]:null,sizeSpread:e["monsterStats.size"]?e["monsterStats.sizeSpread"]:null,statusSpread:e["monsterStats.status"]?e["monsterStats.statusSpread"]:null},c={elements:e["weaknesses.elements"],parts:e["weaknesses.parts"]},l=Object.values(m).some(g=>g!==null);if(l||c.elements||c.parts){let g=Qn(a.gameTask.ovl,p);l&&n.push(Yn(g,m,{hp:r.fork("monster-hp"),size:r.fork("monster-size"),status:r.fork("monster-status")},s,a.gameTask)),(c.elements||c.parts)&&n.push(eo(g,c,{elements:r.fork("weakness-elements"),parts:r.fork("weakness-parts")},s,a.gameTask))}let u=Sn(a.quests),d=_n(gn(a.gameSub.ovl),an(p)),y=dn(a.quests),b=Ta([...u,...d,...y.slots]),v=t(u);if(e["questRewards.enabled"]){let g=kn(t(u),r.fork("quest-rewards"),s);n.push(g.report),v=g.after}let _=t(d);if(e["monsterRewards.enabled"]){let g=e["monsterRewards.captureAndBreaks"],B=t(d.filter(k=>g||k.list.stride===4)),G=t(d.filter(k=>!g&&k.list.stride!==4)),M=wn(B,r.fork("monster-rewards"),s,a.gameSub);n.push(M.report),_=[...M.after,...G]}let w=t(y.slots);if(e["gathering.enabled"]){let g=un(t(y.slots),{pool:e["gathering.pool"],keepItems:e["gathering.keepItems"]},{bands:new Map([...b].map(([B,G])=>[B,G.band])),allItems:ao()},r.fork("gathering"),s);n.push(g.report),w=g.after}let E=[];if(Ra(e)&&!a.eboot)throw new Error("These settings need the decrypted EBOOT");if(e["weapons.enabled"]&&n.push(Dn(a.eboot,a.resolver,e["weapons.mix"],r.fork("weapons"),s)),e["armor.enabled"]&&n.push(tn(a.eboot,a.resolver,r.fork("armor"),s)),e["recipes.materials"]||e["recipes.amounts"]){let g=Ta([...t(u),...t(d),...t(y.slots)]),B=vn(xn(s.eboot(),a.resolver),g,{materials:e["recipes.materials"],amountSpread:e["recipes.amounts"]?e["recipes.amountSpread"]:null,maxQuantity:e["recipes.maxQuantity"]},{materials:r.fork("recipes"),amounts:r.fork("recipe-amounts")},s);n.push(B.report);let G=Ta([...v,..._,...w]);for(let M of Bn(B.assigned,G))E.push(`${M.recipe}: ${M.item} (${M.needs})`)}if(e["shops.enabled"]){let g=e["shops.prices"],B=e["shops.stacks"];n.push(Cn(Gn(a.lobbyTask.ovl),{pool:e["shops.pool"],mix:e["shops.mix"],keepEssentials:e["shops.keepEssentials"],special:e["shops.special"],countSpread:e["shops.countSpread"],priceSpread:g?e["shops.priceSpread"]:null,stackSpread:B?e["shops.stackSpread"]:null},{bands:new Map([...b].map(([G,M])=>[G,M.band])),allItems:ao(),items:ol(a,g||B)},{stock:r.fork("shops"),prices:r.fork("shop-prices"),stacks:r.fork("shop-stacks")},s,a.lobbyTask))}return e["costs.enabled"]&&n.push(ln(pn(a.eboot,a.resolver),e["costs.spread"],r.fork("costs"),s)),{edits:s,reports:n,sources:{tiers:b,gatheringQuests:y.quests,gatheringProblems:y.problems},problems:E}}f();function so(a,e,r){let s=["randomfu spoiler log","",`Seed:     ${e.seed}`,`Settings: ${Ma(e)}`,`Disc:     ${a.discId} (${a.region})`,`Logic:    v${6}`,"",...Aa(e).map(t=>`  ${t}`),""];if(r.problems.length>0){s.push("PROBLEMS (recipe materials that moved to a later star level):");for(let t of r.problems)s.push(`  ${t}`);s.push("")}for(let t of r.reports){s.push(`== ${t.title} ==`,"");for(let p of t.notes)s.push(`  ${p}`);s.push("");let i="";for(let p of t.lines)p.where!==i&&(i=p.where,s.push(i)),s.push(`  ${p.text}`);s.push("")}let{sources:n}=r;if(s.push("== Where items are first found ==",""),s.push("  The earliest rank and star level of a Village or Guild quest that rewards the item,","  has a monster that gives it, or has a gathering point with it, before shuffling.","  Shuffles only move items within these tiers.",`  Gathering points were read in ${n.gatheringQuests} quests.`),n.gatheringProblems.length>0){s.push(`  Gathering points that couldn't be read (${n.gatheringProblems.length}):`);for(let t of n.gatheringProblems.slice(0,20))s.push(`    ${t}`)}s.push("");let o=new Map;for(let[t,i]of n.tiers){let p=V(i),m=o.get(p)??{tier:i,items:[]};m.items.push(I(t)),o.set(p,m)}for(let{tier:t,items:i}of[...o.values()].sort((p,m)=>me(p.tier)-me(m.tier)))s.push(`${ge(t)} (${i.length})`),s.push(`  ${i.sort().join(", ")}`);return`${s.join(`
`)}
`}f();function no(a,e,r){let s=a.stat(Ba),n=(m,c)=>{a.writeInFile(s,e.dataBin.offsetOf(m),e.dataBin.encode(m,c))},o=0;for(let[m,{quest:c,payload:l}]of r.quests)l.equals(c.file.payload)||(n(m,c.file.seal(l)),o++);let t=0;for(let[m,c]of r.files)c.equals(e.dataBin.read(m))||(n(m,c),t++);let i="unchanged",p=r.changedEboot();return p&&(i=a.replaceFile(Ue,p).moved?"moved to the end of the image":"in place"),tl(a,e,r),{quests:o,files:t,eboot:i}}function tl(a,e,r){let s=a.stat(Ba),n=s.lba*2048,o=new Fe((i,p)=>a.source.read(n+i,p),s.size,e.region);for(let[i,{quest:p,payload:m}]of r.quests)if(!va(o.read(i),e.region).payload.equals(m))throw new Error(`Read-back check failed for ${p.path}`);for(let[i,p]of r.files)if(!o.read(i).equals(p))throw new Error(`Read-back check failed for DATA.BIN file ${i}`);let t=r.changedEboot();if(t&&!a.iso.readFile(Ue).equals(t))throw new Error("Read-back check failed for EBOOT.BIN")}var oo=self,Ar=(a,e=[])=>oo.postMessage(a,e),aa=class{constructor(e){this.blob=e}reader=new FileReaderSync;get totalBytes(){return this.blob.size}read(e,r){if(e<0||e+r>this.blob.size)throw new RangeError(`read past the end of the file at 0x${e.toString(16)}`);return Ir.Buffer.from(this.reader.readAsArrayBuffer(this.blob.slice(e,e+r)))}close(){}};function to(a){let e=new aa(a);if(e.totalBytes>=4&&e.read(0,4).toString("latin1")==="CISO")throw new Error("That's a CSO. Decompress it to an ISO first (for example with maxcso or PPSSPP).");return e}var pl=Ir.Buffer.from([127,69,76,70]);async function il(a,e){let r=new Me(to(a)),{region:s,discId:n}=ya(ua(r.readFile("/PSP_GAME/PARAM.SFO"))),o=s==="jp"||s==="eu",t=null;if(o)try{await da(r.readFile(Ue),{external:!1}),t={ok:!0,detail:"decrypted from the disc"}}catch(p){t={ok:!1,detail:p instanceof Error?p.message:String(p)}}let i=null;if(e){let m=new aa(e).read(0,Math.min(4,e.size)).equals(pl);i={ok:m,detail:m?"decrypted (ELF)":"not decrypted (no ELF header)"}}return{type:"checked",discId:n,region:s,supported:o,discEboot:t,eboot:i}}async function ll(a){let e=c=>Ar({type:"log",line:c}),r=on(nn(a.settings.seed),{...a.settings}),s=Ra(r),n=new fa(to(a.iso)),o=new ha(n);e("Reading the disc...");let t=s&&a.eboot?new aa(a.eboot).read(0,a.eboot.size):void 0,i=await qs(n,o.iso,{eboot:s?t?{dump:t}:{external:!1}:null});e(`${i.discId} (${i.region}): ${i.quests.length} quests, ${i.skippedQuests.length} skipped.`),e(`Seed ${r.seed}. Settings string: ${Ma(r)}`);for(let c of Aa(r))e(`  ${c}`);let p=ro(i,r);for(let c of p.reports)e(`${c.title}: ${c.lines.length} slots`);p.problems.length>0&&e(`Warning: ${p.problems.length} recipe materials can't be found as early as before; see the spoiler log.`);let m=null;if(!a.dryRun){let c=no(o,i,p.edits);e(`Changed ${c.quests} quests and ${c.files} other DATA.BIN files; EBOOT ${c.eboot}. Read-back check passed.`),m=n.segments().map(l=>l.kind==="original"?{start:l.start,end:l.end}:{data:new Uint8Array(l.data)})}return{type:"done",spoiler:so(i,r,p),problems:p.problems,segments:m}}oo.onmessage=a=>{let e=a.data;(async()=>{try{let r=e.type==="check"?await il(e.iso,e.eboot):await ll(e),s=r.type==="done"&&r.segments?r.segments.flatMap(n=>"data"in n?[n.data.buffer]:[]):[];Ar(r,s)}catch(r){Ar({type:"error",message:r instanceof Error?r.message:String(r)})}})()};})();
/*! For license information please see worker.js.LEGAL.txt */
//# sourceMappingURL=worker.js.map
