"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes2, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server2 = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server2.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server2, map) {
      for (const event of Object.keys(map)) server2.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server2.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server2) {
      server2._state = CLOSED;
      server2.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server2, req, socket, code, message, headers) {
      if (server2.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server2.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// scripts/host-server.ts
var import_http = require("http");
var import_fs = require("fs");
var import_os = __toESM(require("os"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto = require("crypto");

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// src/core/registry.ts
var ActionRegistryImpl = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  set(name, handler) {
    if (this.handlers.has(name)) {
      console.warn(`[ActionRegistry] \u8986\u76D6\u5DF2\u6709\u52A8\u4F5C: ${name}`);
    }
    this.handlers.set(name, handler);
  }
  get(name) {
    return this.handlers.get(name);
  }
  has(name) {
    return this.handlers.has(name);
  }
  keys() {
    return Array.from(this.handlers.keys());
  }
};
var ConditionRegistryImpl = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  set(name, handler) {
    this.handlers.set(name, handler);
  }
  get(name) {
    return this.handlers.get(name);
  }
  has(name) {
    return this.handlers.has(name);
  }
  check(name, state, params, context) {
    const handler = this.handlers.get(name);
    if (!handler) {
      console.warn(`[ConditionRegistry] \u672A\u627E\u5230\u6761\u4EF6: ${name}`);
      return false;
    }
    return handler.check(state, params, context);
  }
};
var ComponentRegistryImpl = class {
  constructor() {
    this.components = /* @__PURE__ */ new Map();
  }
  set(name, component) {
    this.components.set(name, component);
  }
  get(name) {
    return this.components.get(name);
  }
  has(name) {
    return this.components.has(name);
  }
  renderLayout(layout, data, dispatch) {
    var _a;
    const rendered = {};
    for (const [slotName, config] of Object.entries(layout.slots)) {
      const comp = this.components.get(config.component);
      if (!comp) {
        console.warn(`[ComponentRegistry] \u672A\u627E\u5230\u7EC4\u4EF6: ${config.component} (slot: ${slotName})`);
        continue;
      }
      const slotData = (_a = data[slotName]) != null ? _a : {};
      rendered[slotName] = comp.render(slotData, dispatch);
    }
    return rendered;
  }
};
var FunctionRegistryImpl = class {
  constructor() {
    this.functions = /* @__PURE__ */ new Map();
  }
  set(name, fn) {
    this.functions.set(name, fn);
  }
  get(name) {
    return this.functions.get(name);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call(name, state, ...args) {
    const fn = this.functions.get(name);
    if (!fn) {
      console.warn(`[FunctionRegistry] \u672A\u627E\u5230\u51FD\u6570: ${name}`);
      return void 0;
    }
    return fn(state, ...args);
  }
};
var ActionRegistry = new ActionRegistryImpl();
var ConditionRegistry = new ConditionRegistryImpl();
var ComponentRegistry = new ComponentRegistryImpl();
var FunctionRegistry = new FunctionRegistryImpl();

// src/games/battleship/rules.ts
var BATTLE_SHIPS = [
  { id: "ship_carrier", size: 5 },
  { id: "ship_battleship", size: 4 },
  { id: "ship_cruiser", size: 3 },
  { id: "ship_submarine", size: 3 },
  { id: "ship_patrol", size: 2 }
];
var COLS = "ABCDEFGHIJ";
var SIZE = 10;
function parseCell(cell) {
  const m = /^([A-J])(10|[1-9])$/.exec(cell);
  if (!m) return null;
  return { r: m[2] === "10" ? 9 : Number(m[2]) - 1, c: COLS.indexOf(m[1]) };
}
function cellAt(r, c) {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  return COLS[c] + (r + 1);
}
function initBoards(count) {
  return {
    stage: "placement",
    boards: Array.from({ length: count }, () => ({
      placed: false,
      confirmed: false,
      ships: BATTLE_SHIPS.map((s) => ({ id: s.id, size: s.size, cells: [], hits: 0, sunk: false })),
      shots: {}
    }))
  };
}
function isValidShape(cells) {
  if (cells.length === 0) return false;
  const pts = cells.map(parseCell);
  if (pts.some((p) => !p)) return false;
  const list = pts;
  if (new Set(cells).size !== cells.length) return false;
  const rows = list.map((p) => p.r);
  const cols = list.map((p) => p.c);
  const vertical = rows.every((r) => r === rows[0]);
  const horizontal = cols.every((c) => c === cols[0]);
  if (!vertical && !horizontal) return false;
  const line = (vertical ? cols : rows).slice().sort((a, b) => a - b);
  for (let i = 1; i < line.length; i++) {
    if (line[i] !== line[i - 1] + 1) return false;
  }
  return true;
}
function placeShip(extra, playerIndex, shipId, cells) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  const ship = board.ships.find((s) => s.id === shipId);
  if (!ship) return { ok: false, error: `\u672A\u77E5\u8230\u8239: ${shipId}` };
  if (cells.length !== ship.size) return { ok: false, error: `\u957F\u5EA6\u4E0D\u7B26: \u9700\u8981 ${ship.size} \u683C` };
  if (!isValidShape(cells)) return { ok: false, error: "\u5FC5\u987B\u6A2A/\u7AD6\u4E00\u6761\u76F4\u7EBF\u4E14\u8FDE\u7EED" };
  const otherCells = new Set(
    board.ships.filter((s) => s.id !== shipId).flatMap((s) => s.cells)
  );
  if (cells.some((c) => otherCells.has(c))) return { ok: false, error: "\u4E0E\u5DF2\u6709\u8230\u8239\u91CD\u53E0" };
  const newBoard = {
    ...board,
    confirmed: false,
    // 改船后需重新确认
    ships: board.ships.map((s) => s.id === shipId ? { ...s, cells } : s)
  };
  newBoard.placed = newBoard.ships.every((s) => s.cells.length > 0);
  const boards = extra.boards.map((b, i) => i === playerIndex ? newBoard : b);
  return { ok: true, extra: { ...extra, boards } };
}
function removeShip(extra, playerIndex, shipId) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  const ship = board.ships.find((s) => s.id === shipId);
  if (!ship) return { ok: false, error: `\u672A\u77E5\u8230\u8239: ${shipId}` };
  if (ship.cells.length === 0) return { ok: false, error: "\u8BE5\u8230\u672A\u90E8\u7F72" };
  const newBoard = {
    ...board,
    confirmed: false,
    // 移除舰船后需重新确认
    ships: board.ships.map((s) => s.id === shipId ? { ...s, cells: [], hits: 0, sunk: false } : s)
  };
  newBoard.placed = newBoard.ships.every((s) => s.cells.length > 0);
  const boards = extra.boards.map((b, i) => i === playerIndex ? newBoard : b);
  return { ok: true, extra: { ...extra, boards } };
}
function randomCells(size) {
  const horizontal = Math.random() < 0.5;
  const r = Math.floor(Math.random() * SIZE);
  const c = Math.floor(Math.random() * SIZE);
  if (horizontal) {
    const c0 = Math.min(c, SIZE - size);
    return Array.from({ length: size }, (_, i) => cellAt(r, c0 + i));
  }
  const r0 = Math.min(r, SIZE - size);
  return Array.from({ length: size }, (_, i) => cellAt(r0 + i, c));
}
function randomPlace(extra, playerIndex) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  if (board.placed && board.confirmed) return { ok: false, error: "\u8BE5\u73A9\u5BB6\u5DF2\u786E\u8BA4\u5E03\u9635" };
  for (let attempt = 0; attempt < 2e3; attempt++) {
    const ships = board.ships.map((s) => ({ ...s, cells: [] }));
    const used = /* @__PURE__ */ new Set();
    let success = true;
    for (const ship of ships) {
      const cells = randomCells(ship.size);
      if (cells.some((c) => used.has(c)) || !isValidShape(cells)) {
        success = false;
        break;
      }
      ship.cells = cells;
      cells.forEach((c) => used.add(c));
    }
    if (!success) continue;
    const newBoard = { ...board, placed: true, confirmed: false, ships };
    const boards = extra.boards.map((b, i) => i === playerIndex ? newBoard : b);
    return { ok: true, extra: { ...extra, boards } };
  }
  return { ok: false, error: "\u968F\u673A\u5E03\u9635\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" };
}
function confirmBoard(extra, playerIndex) {
  if (extra.stage !== "placement") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  if (!board) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  if (!board.placed) return { ok: false, error: "\u8BF7\u5148\u90E8\u7F72\u5168\u90E8\u8230\u8239" };
  if (board.confirmed) return { ok: false, error: "\u5DF2\u786E\u8BA4\u5E03\u9635" };
  const boards = extra.boards.map((b, i) => i === playerIndex ? { ...b, confirmed: true } : b);
  const allConfirmed = boards.every((b) => b.confirmed);
  return { ok: true, extra: { ...extra, stage: allConfirmed ? "battle" : "placement", boards } };
}
function fire(extra, playerIndex, cell) {
  if (extra.stage !== "battle") return { ok: false, error: "\u5F53\u524D\u4E0D\u5728\u6218\u6597\u9636\u6BB5" };
  const board = extra.boards[playerIndex];
  const target = extra.boards[playerIndex ^ 1];
  if (!board || !target) return { ok: false, error: "\u68CB\u76D8\u672A\u521D\u59CB\u5316" };
  if (!parseCell(cell)) return { ok: false, error: "\u975E\u6CD5\u5750\u6807" };
  if (board.shots[cell]) return { ok: false, error: "\u8BE5\u683C\u5DF2\u5F00\u706B" };
  const shots = { ...board.shots };
  const hitShip = target.ships.find((s) => s.cells.includes(cell));
  if (!hitShip) {
    shots[cell] = "miss";
    const boards2 = extra.boards.map((b, i) => i === playerIndex ? { ...b, shots } : b);
    return {
      ok: true,
      extra: { ...extra, boards: boards2 },
      result: { cell, result: "miss", sunk: null, winner: null }
    };
  }
  const hits = hitShip.hits + 1;
  const sunk = hits === hitShip.size;
  shots[cell] = sunk ? "sunk" : "hit";
  const targetShips = target.ships.map(
    (s) => s.id === hitShip.id ? { ...s, hits, sunk } : s
  );
  const boards = extra.boards.map(
    (b, i) => i === playerIndex ? { ...b, shots } : i === (playerIndex ^ 1) ? { ...b, ships: targetShips } : b
  );
  const allSunk = targetShips.every((s) => s.sunk);
  return {
    ok: true,
    extra: { ...extra, boards },
    result: {
      cell,
      result: sunk ? "sunk" : "hit",
      sunk: sunk ? hitShip.id : null,
      winner: allSunk ? playerIndex : null
    }
  };
}

// src/core/reducer.ts
function reducer(state, action) {
  switch (action.type) {
    case "start_game":
      return handleStartGame(state, action);
    case "call_landlord":
      return handleCallLandlord(state, action);
    case "play_cards":
      return handlePlayCards(state, action);
    case "pass":
      return handlePass(state, action);
    case "battleship_place":
      return handleBattleshipPlace(state, action);
    case "battleship_random":
      return handleBattleshipRandom(state, action);
    case "battleship_remove":
      return handleBattleshipRemove(state, action);
    case "battleship_confirm":
      return handleBattleshipConfirm(state, action);
    case "battleship_fire":
      return handleBattleshipFire(state, action);
    default:
      return state;
  }
}
function handleStartGame(state, _action) {
  if (state.phase !== "idle") return state;
  return {
    ...state,
    version: state.version + 1,
    phase: "calling",
    currentTurn: 0
  };
}
function handleCallLandlord(state, action) {
  var _a;
  if (state.phase !== "calling") return state;
  const call = (_a = action.payload) == null ? void 0 : _a.call;
  if (!call) {
    const nextTurn = (state.currentTurn + 1) % state.players.length;
    if (nextTurn === 0) {
      return { ...state, version: state.version + 1, phase: "ended", winner: -1, currentTurn: 0 };
    }
    return { ...state, version: state.version + 1, currentTurn: nextTurn };
  }
  return {
    ...state,
    version: state.version + 1,
    landlordIndex: action.playerIndex,
    phase: "playing",
    currentTurn: action.playerIndex,
    players: state.players.map((p) => {
      if (p.index === action.playerIndex) {
        return { ...p, hand: [...p.hand, ...state.bottomCards], handCount: p.hand.length + state.bottomCards.length };
      }
      return p;
    }),
    bottomCards: [],
    lastPlay: null,
    passCount: 0
  };
}
function handlePlayCards(state, action) {
  var _a, _b;
  if (state.phase !== "playing" || action.playerIndex !== state.currentTurn) return state;
  const cards = (_b = (_a = action.payload) == null ? void 0 : _a.cards) != null ? _b : [];
  const player = state.players[action.playerIndex];
  const playedCards = player.hand.filter((c) => cards.includes(c.id));
  const remainingHand = player.hand.filter((c) => !cards.includes(c.id));
  const newPlayers = state.players.map((p, i) => {
    if (i === action.playerIndex) {
      return { ...p, hand: remainingHand, handCount: remainingHand.length };
    }
    return p;
  });
  if (remainingHand.length === 0) {
    const winner = action.playerIndex === state.landlordIndex ? state.landlordIndex : (state.landlordIndex + 1) % state.players.length;
    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      discard: playedCards,
      lastPlay: { playerIndex: action.playerIndex, cards: playedCards, pattern: null },
      phase: "ended",
      winner
    };
  }
  const nextTurn = (state.currentTurn + 1) % state.players.length;
  return {
    ...state,
    version: state.version + 1,
    players: newPlayers,
    discard: playedCards,
    lastPlay: { playerIndex: action.playerIndex, cards: playedCards, pattern: null },
    currentTurn: nextTurn,
    passCount: 0
  };
}
function handlePass(state, action) {
  if (state.phase !== "playing" || action.playerIndex !== state.currentTurn) return state;
  const nextTurn = (state.currentTurn + 1) % state.players.length;
  return {
    ...state,
    version: state.version + 1,
    currentTurn: nextTurn,
    passCount: state.passCount + 1
  };
}
function ensureExtra(state) {
  const extra = state.extra;
  if (extra && Array.isArray(extra.boards)) return extra;
  return initBoards(state.players.length || 2);
}
function applyExtra(state, extra) {
  return {
    ...state,
    version: state.version + 1,
    extra,
    phase: extra.stage === "battle" ? "playing" : state.phase
  };
}
function handleBattleshipPlace(state, action) {
  if (state.phase === "ended") return state;
  const payload = action.payload;
  if (!payload || typeof payload.shipId !== "string" || !Array.isArray(payload.cells)) return state;
  const r = placeShip(ensureExtra(state), action.playerIndex, payload.shipId, payload.cells);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipRandom(state, action) {
  if (state.phase === "ended") return state;
  const r = randomPlace(ensureExtra(state), action.playerIndex);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipRemove(state, action) {
  if (state.phase === "ended") return state;
  const payload = action.payload;
  if (!payload || typeof payload.shipId !== "string") return state;
  const r = removeShip(ensureExtra(state), action.playerIndex, payload.shipId);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipConfirm(state, action) {
  if (state.phase === "ended") return state;
  const r = confirmBoard(ensureExtra(state), action.playerIndex);
  if (!r.ok) return state;
  return applyExtra(state, r.extra);
}
function handleBattleshipFire(state, action) {
  var _a;
  const extra = state.extra;
  if (!extra || extra.stage !== "battle") return state;
  if (state.phase !== "playing" || action.playerIndex !== state.currentTurn) return state;
  const payload = action.payload;
  if (!payload || typeof payload.cell !== "string") return state;
  const r = fire(extra, action.playerIndex, payload.cell);
  if (!r.ok) return state;
  const next = { ...state, version: state.version + 1, extra: r.extra };
  const log2 = (_a = r.extra.log) != null ? _a : [];
  next.extra = {
    ...r.extra,
    log: [...log2, { by: action.playerIndex, cell: payload.cell, result: r.result.result, sunk: r.result.sunk }].slice(-100)
  };
  if (r.result.winner !== null) {
    next.phase = "ended";
    next.winner = r.result.winner;
  } else {
    next.currentTurn = (state.currentTurn + 1) % state.players.length;
  }
  return next;
}

// src/core/l3Inline.ts
var L3Inline = class {
  constructor(l3Code) {
    this.hooks = /* @__PURE__ */ new Map();
    this.functions = /* @__PURE__ */ new Map();
    const gameAPI = {
      on: (event, callback) => {
        var _a;
        const list = (_a = this.hooks.get(event)) != null ? _a : [];
        list.push(callback);
        this.hooks.set(event, list);
      },
      off: (event, callback) => {
        const list = this.hooks.get(event);
        if (list) this.hooks.set(event, list.filter((cb) => cb !== callback));
      }
    };
    const registerFunction = (name, fn2) => {
      this.functions.set(name, fn2);
    };
    const fn = new Function("game", "registerFunction", l3Code);
    fn(gameAPI, registerFunction);
  }
  async call(type, name, state, args) {
    if (type === "hook") {
      const list = this.hooks.get(name);
      if (list) {
        for (const cb of list) cb(state, ...args);
      }
      return void 0;
    }
    const fn = this.functions.get(name);
    if (!fn) {
      throw new Error(`\u672A\u6CE8\u518C\u7684L3\u51FD\u6570: ${name}`);
    }
    return fn(state, ...args);
  }
};

// src/core/engine.ts
var import_meta = {};
var GameEngine = class {
  constructor(initialState) {
    this.config = null;
    this.worker = null;
    this.inline = null;
    this.workerReady = false;
    this.pendingCallbacks = /* @__PURE__ */ new Map();
    this.requestId = 0;
    // 串行队列：保证并发 dispatch 按到达顺序逐个执行（L3 worker 基于 this.state 快照，
    // 并发会 lost update——后完成者覆盖先完成者）
    this.dispatchQueue = Promise.resolve();
    this.state = initialState;
  }
  // ========== 配置加载 ==========
  loadGame(config) {
    var _a, _b, _c;
    for (const rule of (_b = (_a = config.l2) == null ? void 0 : _a.rules) != null ? _b : []) {
      for (const action of (_c = rule == null ? void 0 : rule.actions) != null ? _c : []) {
        if (!ActionRegistry.has(action.type)) {
          ActionRegistry.set(action.type, {
            execute: (s, _p, _c2) => s,
            validate: () => true
          });
        }
      }
      if (rule.condition && !ConditionRegistry.has(rule.condition.type)) {
        ConditionRegistry.set(rule.condition.type, { check: () => true });
      }
    }
    const errors = this.validateConfig(config);
    if (errors.filter((e) => e.level === "error").length > 0) {
      return errors;
    }
    this.config = config;
    if (config.l3) {
      this.initWorker(config.l3);
    }
    return errors;
  }
  validateConfig(config) {
    var _a, _b;
    const errors = [];
    const { l1, l2 } = config;
    if (!(l1 == null ? void 0 : l1.cards) || l1.cards.length === 0) {
      errors.push({ level: "error", path: "l1.cards", message: "\u5361\u724C\u5217\u8868\u4E0D\u80FD\u4E3A\u7A7A" });
    }
    if (!(l1 == null ? void 0 : l1.players) || l1.players.count < 2) {
      errors.push({ level: "error", path: "l1.players.count", message: "\u81F3\u5C11\u9700\u89812\u540D\u73A9\u5BB6" });
    }
    for (const rule of (_a = l2 == null ? void 0 : l2.rules) != null ? _a : []) {
      for (const action of (_b = rule == null ? void 0 : rule.actions) != null ? _b : []) {
        if (!ActionRegistry.has(action.type)) {
          errors.push({ level: "error", path: `l2.rules.actions.${action.type}`, message: `\u672A\u6CE8\u518C\u7684\u52A8\u4F5C: ${action.type}` });
        }
      }
      if (rule.condition && !ConditionRegistry.has(rule.condition.type)) {
        errors.push({
          level: "warning",
          path: `l2.rules.condition.${rule.condition.type}`,
          message: `\u672A\u6CE8\u518C\u7684\u6761\u4EF6: ${rule.condition.type}`
        });
      }
    }
    return errors;
  }
  // ========== L3 管理（浏览器用 Worker 沙箱，Node 用进程内执行） ==========
  initWorker(l3Code) {
    if (typeof Worker === "undefined") {
      this.inline = new L3Inline(l3Code);
      this.workerReady = true;
      return;
    }
    this.worker = new Worker(new URL("./l3.worker.ts", import_meta.url), { type: "module" });
    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const cb = this.pendingCallbacks.get(id);
      if (cb) {
        this.pendingCallbacks.delete(id);
        if (error) {
          console.error(`[Engine] L3 Worker \u9519\u8BEF: ${error}`);
        }
        cb(result);
      }
    };
    this.worker.postMessage({ type: "init", code: l3Code });
    this.workerReady = true;
  }
  callWorker(type, name, args) {
    if (!this.workerReady) {
      return Promise.resolve(void 0);
    }
    if (this.inline) {
      return this.inline.call(type, name, this.state, args);
    }
    if (!this.worker) {
      return Promise.resolve(void 0);
    }
    const id = ++this.requestId;
    return new Promise((resolve) => {
      this.pendingCallbacks.set(id, resolve);
      const req = { id, type, name, state: this.state, args };
      this.worker.postMessage(req);
    });
  }
  // 调用 L3 注册的自定义函数（state 会自动作为首个参数传入）
  query(name, ...args) {
    if (!this.workerReady) return Promise.resolve(void 0);
    return this.callWorker("query", name, args);
  }
  // ========== 状态管理 ==========
  getState() {
    return this.state;
  }
  loadState(state) {
    this.state = state;
  }
  async dispatch(action) {
    const run = this.dispatchQueue.then(() => this.dispatchInner(action));
    this.dispatchQueue = run.catch(() => {
    });
    return run;
  }
  async dispatchInner(action) {
    await this.callWorker("hook", "before_action", [action]);
    const prevState = this.state;
    const newState = reducer(prevState, action);
    if (newState === prevState) {
      return {
        code: "INVALID_ACTION",
        message: `\u52A8\u4F5C ${action.type} \u5728\u5F53\u524D\u72B6\u6001\u4E0B\u4E0D\u53EF\u6267\u884C`
      };
    }
    const l3Validate = await this.callWorker("query", "validate_action", [newState, action]);
    if (l3Validate === false) {
      return { code: "L3_VALIDATION_FAILED", message: "L3\u6821\u9A8C\u672A\u901A\u8FC7" };
    }
    this.state = newState;
    await this.callWorker("hook", "after_state_update", [this.state]);
    return null;
  }
  // ========== 玩家视图过滤 ==========
  buildPlayerView(playerIndex) {
    if (!this.config) {
      throw new Error("\u672A\u52A0\u8F7D\u6E38\u620F\u914D\u7F6E");
    }
    const visibility = this.config.l1.visibility;
    const players = this.state.players.map(
      (p) => this.filterPlayerData(p, playerIndex, visibility)
    );
    const publicState = {
      currentTurn: this.state.currentTurn,
      phase: this.state.phase,
      landlordIndex: this.state.landlordIndex,
      lastPlay: this.state.lastPlay,
      passCount: this.state.passCount,
      winner: this.state.winner,
      discard: this.state.discard,
      bottomCards: this.filterField("bottomCards", this.state.bottomCards, playerIndex, visibility)
    };
    return {
      version: this.state.version,
      playerIndex,
      phase: this.state.phase,
      currentTurn: this.state.currentTurn,
      winner: this.state.winner,
      players,
      publicState
    };
  }
  filterPlayerData(player, viewerIndex, visibility) {
    var _a;
    const isOwner = player.index === viewerIndex;
    const rule = (_a = visibility["players[*].hand"]) != null ? _a : { mode: "full", description: "" };
    let hand;
    if (rule.mode === "owner_only") {
      hand = isOwner ? player.hand : { count: player.hand.length };
    } else if (rule.mode === "count") {
      hand = { count: player.hand.length };
    } else if (rule.mode === "hidden") {
      hand = { count: 0 };
    } else {
      hand = player.hand;
    }
    return {
      index: player.index,
      name: player.name,
      hand,
      handCount: player.hand.length,
      isDisconnected: player.isDisconnected,
      extra: player.extra
    };
  }
  filterField(_fieldPath, value, _playerIndex, _visibility) {
    return value;
  }
  // ========== 生命周期 ==========
  startGame(count) {
    if (!this.config) throw new Error("\u672A\u52A0\u8F7D\u6E38\u620F\u914D\u7F6E");
    const l1 = this.config.l1;
    const deck = [...l1.cards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const total = count != null ? count : l1.players.count;
    const cardsPer = Math.floor(51 / total);
    const players = [];
    for (let i = 0; i < total; i++) {
      players.push({
        index: i,
        name: i === 0 ? "\u4F60" : `\u73A9\u5BB6 ${i + 1}`,
        hand: deck.slice(i * cardsPer, (i + 1) * cardsPer),
        handCount: cardsPer,
        isHost: i === 0,
        isDisconnected: false
      });
    }
    const bottomCards = deck.slice(total * cardsPer, total * cardsPer + 3);
    this.state = { ...this.state, players, deck: [], bottomCards, phase: "calling", currentTurn: 0 };
  }
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCallbacks.clear();
  }
};

// src/games/battleship/config.json
var config_default = {
  meta: {
    name: "\u6D77\u6218\u68CB",
    version: "1.0",
    maxPlayers: 2
  },
  l1: {
    cards: [
      { id: "ship_carrier", name: "\u822A\u7A7A\u6BCD\u8230", suit: "ship", rank: "5", value: 5, extra: { size: 5 } },
      { id: "ship_battleship", name: "\u6218\u5217\u8230", suit: "ship", rank: "4", value: 4, extra: { size: 4 } },
      { id: "ship_cruiser", name: "\u5DE1\u6D0B\u8230", suit: "ship", rank: "3", value: 3, extra: { size: 3 } },
      { id: "ship_submarine", name: "\u6F5C\u8247", suit: "ship", rank: "3", value: 2, extra: { size: 3 } },
      { id: "ship_patrol", name: "\u5DE1\u903B\u8247", suit: "ship", rank: "2", value: 1, extra: { size: 2 } },
      { id: "cell_hit", name: "\u{1F4A5} \u547D\u4E2D", suit: "token", rank: "H", value: 0 },
      { id: "cell_miss", name: "\u{1F4A7} \u672A\u547D\u4E2D", suit: "token", rank: "M", value: 0 },
      { id: "cell_empty", name: "\u{1F30A} \u672A\u77E5", suit: "token", rank: "E", value: 0 }
    ],
    players: {
      count: 2,
      initialResources: {}
    },
    uiLayout: {
      slots: {
        top_bar: { component: "info_area" },
        main_area: { component: "board_area" },
        bottom_bar: { component: "ship_area" }
      },
      presetSlots: ["top_bar", "main_area", "bottom_bar"]
    },
    visibility: {
      "players[*].board": { mode: "owner_only", description: "\u5DF1\u65B9\u68CB\u76D8\u4EC5\u81EA\u5DF1\u53EF\u89C1" },
      "players[*].enemyView": { mode: "owner_only", description: "\u654C\u65B9\u89C6\u91CE\u4EC5\u81EA\u5DF1\u53EF\u89C1" },
      "players[*].ships": { mode: "owner_only", description: "\u8230\u8239\u90E8\u7F72\u4EC5\u81EA\u5DF1\u53EF\u89C1" }
    }
  },
  l2: {
    rules: [
      {
        trigger: "on_game_start",
        actions: [{ type: "enter_placement" }]
      },
      {
        trigger: "on_placement_complete",
        actions: [{ type: "enter_battle" }]
      },
      {
        trigger: "on_turn_start",
        actions: [{ type: "wait_for_shot" }]
      },
      {
        trigger: "on_shot_fired",
        actions: [
          { type: "check_hit" },
          { type: "check_sunk" },
          { type: "check_win" },
          { type: "next_turn" }
        ]
      },
      {
        trigger: "on_all_sunk",
        actions: [{ type: "declare_winner" }]
      }
    ]
  },
  l3: null
};

// src/games/battleship/l3.ts
var l3Script = `
// ---------- \u5E38\u91CF ----------
var COLS = 'ABCDEFGHIJ';

function parseCell(cell) {
  if (typeof cell !== 'string') return null;
  var m = /^([A-J])(10|[1-9])$/.exec(cell);
  if (!m) return null;
  return { r: m[2] === '10' ? 9 : Number(m[2]) - 1, c: COLS.indexOf(m[1]) };
}

function boardOf(state, idx) {
  var extra = state && state.extra;
  return extra && Array.isArray(extra.boards) ? extra.boards[idx] : null;
}

function shipOf(board, shipId) {
  return board.ships.find(function (s) { return s.id === shipId; });
}

function validShape(cells) {
  if (!cells || cells.length === 0) return false;
  var pts = cells.map(parseCell);
  if (pts.some(function (p) { return !p; })) return false;
  if (new Set(cells).size !== cells.length) return false;
  var rows = pts.map(function (p) { return p.r; });
  var cols = pts.map(function (p) { return p.c; });
  var vertical = rows.every(function (r) { return r === rows[0]; });
  var horizontal = cols.every(function (c) { return c === cols[0]; });
  if (!vertical && !horizontal) return false;
  var line = (vertical ? cols : rows).slice().sort(function (a, b) { return a - b; });
  for (var i = 1; i < line.length; i++) {
    if (line[i] !== line[i - 1] + 1) return false;
  }
  return true;
}

// ---------- \u5E03\u9635\u6821\u9A8C ----------

function placeShip(state, playerIndex, shipId, cells) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  var ship = shipOf(board, shipId);
  if (!ship) return { ok: false, error: '\u672A\u77E5\u8230\u8239' };
  if (!cells || cells.length !== ship.size) return { ok: false, error: '\u957F\u5EA6\u4E0D\u7B26' };
  if (!validShape(cells)) return { ok: false, error: '\u5FC5\u987B\u6A2A/\u7AD6\u4E00\u6761\u76F4\u7EBF\u4E14\u8FDE\u7EED' };
  var selfCells = ship.cells || [];
  var otherCells = board.ships
    .filter(function (s) { return s.id !== shipId; })
    .reduce(function (acc, s) { return acc.concat(s.cells); }, []);
  var conflict = cells.some(function (c) { return otherCells.indexOf(c) >= 0; });
  if (conflict) return { ok: false, error: '\u4E0E\u5DF2\u6709\u8230\u8239\u91CD\u53E0' };
  return { ok: true };
}

function removeShip(state, playerIndex, shipId) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  var ship = shipOf(board, shipId);
  if (!ship) return { ok: false, error: '\u672A\u77E5\u8230\u8239' };
  if (!ship.cells || ship.cells.length === 0) return { ok: false, error: '\u8BE5\u8230\u672A\u90E8\u7F72' };
  return { ok: true };
}

function randomPlace(state, playerIndex) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  if (board.placed && board.confirmed) return { ok: false, error: '\u8BE5\u73A9\u5BB6\u5DF2\u786E\u8BA4\u5E03\u9635' };
  return { ok: true };
}

function confirmBoard(state, playerIndex) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'placement') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u5E03\u9635\u9636\u6BB5' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  if (!board.placed) return { ok: false, error: '\u8BF7\u5148\u90E8\u7F72\u5168\u90E8\u8230\u8239' };
  if (board.confirmed) return { ok: false, error: '\u5DF2\u786E\u8BA4\u5E03\u9635' };
  return { ok: true };
}

// ---------- \u5F00\u706B\u6821\u9A8C ----------

function fire(state, playerIndex, cell) {
  var extra = state.extra;
  if (!extra || extra.stage !== 'battle') return { ok: false, error: '\u5F53\u524D\u4E0D\u5728\u6218\u6597\u9636\u6BB5' };
  if (playerIndex !== state.currentTurn) return { ok: false, error: '\u672A\u8F6E\u5230\u4F60' };
  var board = boardOf(state, playerIndex);
  if (!board) return { ok: false, error: '\u68CB\u76D8\u672A\u521D\u59CB\u5316' };
  if (!parseCell(cell)) return { ok: false, error: '\u975E\u6CD5\u5750\u6807' };
  if (board.shots[cell]) return { ok: false, error: '\u8BE5\u683C\u5DF2\u5F00\u706B' };
  return { ok: true };
}

// ---------- \u5F15\u64CE\u81EA\u52A8\u8C03\u7528\u7684\u52A8\u4F5C\u6821\u9A8C ----------

function validateAction(oldState, _newState, action) {
  if (!action || typeof action !== 'object') return false;
  switch (action.type) {
    case 'start_game':
      return oldState.phase === 'idle';
    case 'battleship_place': {
      var p = action.payload || {};
      return placeShip(oldState, action.playerIndex, p.shipId, p.cells).ok;
    }
    case 'battleship_random':
      return randomPlace(oldState, action.playerIndex).ok;
    case 'battleship_remove': {
      var p = action.payload || {};
      return removeShip(oldState, action.playerIndex, p.shipId).ok;
    }
    case 'battleship_confirm':
      return confirmBoard(oldState, action.playerIndex).ok;
    case 'battleship_fire': {
      var p = action.payload || {};
      return fire(oldState, action.playerIndex, p.cell).ok;
    }
    default:
      return true;
  }
}

// ---------- \u94A9\u5B50 ----------

game.on('before_action', function (state, action) {
  console.log('[L3] before_action: ' + action.type + ' by ' + action.playerIndex);
});

game.on('after_state_update', function (state) {
  var stage = state.extra ? state.extra.stage : '?';
  console.log('[L3] after_state_update: phase=' + state.phase + ' turn=' + state.currentTurn + ' stage=' + stage);
});

// ---------- \u6CE8\u518C ----------

registerFunction('validate_action', validateAction);
registerFunction('place_ship', placeShip);
registerFunction('random_place', randomPlace);
registerFunction('remove_ship', removeShip);
registerFunction('confirm_board', confirmBoard);
registerFunction('fire', fire);
`;

// src/games/battleship/test.ts
var battleshipTest = {
  id: "battleship",
  name: "\u6D77\u6218\u68CB",
  description: "\u53CC\u4EBA\u7B56\u7565\u6D77\u6218",
  playerCount: "2",
  ready: true,
  config: { ...config_default, l3: l3Script }
};

// src/games/battleship/view.ts
function stripShips(board) {
  return {
    placed: board.placed,
    confirmed: board.confirmed,
    shots: board.shots,
    ships: board.ships.map((s) => ({ id: s.id, size: s.size, hits: s.hits, sunk: s.sunk, cells: [] }))
  };
}
function filterExtra(extra, viewerIndex) {
  var _a;
  return {
    stage: extra.stage,
    log: (_a = extra.log) != null ? _a : [],
    boards: extra.boards.map((b, i) => i === viewerIndex ? b : stripShips(b))
  };
}

// scripts/host-server.ts
var PORT = parseInt(process.argv[2] || "8787", 10);
var DOCS = process.env.BGS_DOCS || import_path.default.join(__dirname, "..", "docs");
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json"
};
var GAMES = [{
  id: battleshipTest.id,
  name: battleshipTest.name,
  description: "\u53CC\u4EBA\u7B56\u7565\u6D77\u6218",
  minPlayers: 2,
  maxPlayers: 2,
  ready: true
}];
var seq = 0;
var conns = /* @__PURE__ */ new Map();
var playersCache = /* @__PURE__ */ new Map();
var kickedSet = /* @__PURE__ */ new Set();
var hostId = "";
var roomPassword = "";
var sessionKey = (0, import_crypto.randomBytes)(32).toString("hex");
function encryptText(text) {
  const iv = (0, import_crypto.randomBytes)(12);
  const c = (0, import_crypto.createCipheriv)("aes-256-gcm", Buffer.from(sessionKey, "hex"), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}
function decryptText(b64) {
  try {
    const data = Buffer.from(b64, "base64");
    const iv = data.subarray(0, 12);
    const ct = data.subarray(12, data.length - 16);
    const tag = data.subarray(data.length - 16);
    const d = (0, import_crypto.createDecipheriv)("aes-256-gcm", Buffer.from(sessionKey, "hex"), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
var session = null;
function log(msg) {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}`);
}
function v6Rank(addr) {
  const a = addr.toLowerCase();
  if (a.includes("ff:fe")) return 1;
  return 0;
}
function isPlaceholder(addr) {
  return addr.toLowerCase().endsWith("::1");
}
function collectAddresses() {
  var _a;
  const wan = [];
  const lanV4 = [];
  const lanV6 = [];
  const nets = import_os.default.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const isCell = /rmnet|ccmni|radio|wwan/i.test(name);
    const isLan = /wlan|eth|enp|ens|ap0|softap|wlan1|wlan2|p2p/i.test(name);
    for (const ni of (_a = nets[name]) != null ? _a : []) {
      if (ni.internal) continue;
      const fam = String(ni.family).toLowerCase();
      const addr = ni.address;
      if (fam.includes("6")) {
        if (addr.toLowerCase().startsWith("fe80")) continue;
        if (isCell) wan.push(addr);
        else if (isLan) lanV6.push(addr);
        else wan.push(addr);
      } else {
        if (isCell) continue;
        if (isLan) lanV4.push(addr);
        else lanV4.push(addr);
      }
    }
  }
  wan.sort((a, b) => v6Rank(a) - v6Rank(b));
  lanV6.sort((a, b) => v6Rank(a) - v6Rank(b));
  return {
    wan: wan.filter((a) => !isPlaceholder(a)),
    lanV4,
    lanV6: lanV6.filter((a) => !isPlaceholder(a))
  };
}
var ADDRS = collectAddresses();
log(`\u672C\u673A\u53EF\u8FBE\u5730\u5740: wan(v6)=[${ADDRS.wan.join(", ")}] lanV4=[${ADDRS.lanV4.join(", ")}] lanV6=[${ADDRS.lanV6.join(", ")}]`);
function send(ws, msg) {
  if (ws.readyState === import_websocket.default.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  for (const c of conns.values()) send(c.ws, msg);
}
function lobbyState() {
  var _a;
  return {
    status: session ? "playing" : "lobby",
    players: Array.from(conns.values()).map((c) => c.player),
    games: GAMES,
    currentGame: (_a = session == null ? void 0 : session.gameId) != null ? _a : null,
    you: "",
    // 按连接填充
    addresses: ADDRS,
    hasPassword: !!roomPassword,
    key: sessionKey
  };
}
function broadcastLobby(notice) {
  for (const c of conns.values()) {
    send(c.ws, { type: "lobby_state", payload: { ...lobbyState(), you: c.player.id, notice } });
  }
}
var s0 = {
  version: 0,
  players: [],
  deck: [],
  discard: [],
  bottomCards: [],
  landlordIndex: -1,
  currentTurn: 0,
  phase: "idle",
  lastPlay: null,
  passCount: 0,
  winner: null
};
function startSession(gameId, seats) {
  const meta = GAMES.find((g) => g.id === gameId);
  if (!meta) {
    log(`\u672A\u77E5\u6E38\u620F: ${gameId}`);
    return;
  }
  const players = seats.filter((s2) => s2.seat === "player");
  if (players.length < meta.minPlayers || players.length > meta.maxPlayers) {
    log(`\u6E38\u620F\u4F4D\u6570\u91CF\u4E0D\u7B26: \u5141\u8BB8 ${meta.minPlayers}~${meta.maxPlayers}\uFF0C\u5B9E\u9645 ${players.length}`);
    return;
  }
  const engine = new GameEngine(s0);
  const config = battleshipTest.config;
  const errs = engine.loadGame(config);
  if (errs.filter((e) => e.level === "error").length > 0) {
    log(`\u914D\u7F6E\u9519\u8BEF: ${errs.map((e) => e.message).join("; ")}`);
    return;
  }
  engine.startGame(players.length);
  const s = engine.getState();
  engine.loadState({ ...s, extra: initBoards(players.length), phase: "idle" });
  const seatMap = /* @__PURE__ */ new Map();
  players.forEach((p, i) => seatMap.set(p.playerId, i));
  session = {
    gameId,
    engine,
    seats: seatMap,
    spectators: seats.filter((s2) => s2.seat === "spectator").map((s2) => s2.playerId),
    pendingReconnect: null,
    pendingTimer: null
  };
  log(`\u6E38\u620F\u4F1A\u8BDD\u5F00\u59CB: ${gameId} \u73A9\u5BB6=[${players.map((p) => p.playerId).join(",")}] \u89C2\u6218=[${session.spectators.join(",")}]`);
  broadcast({ type: "game_started", payload: { gameId, seats: Object.fromEntries(seatMap), spectators: session.spectators } });
  broadcastGameState();
  broadcastConnState();
}
function broadcastGameState() {
  var _a, _b;
  if (!session) return;
  const state = session.engine.getState();
  for (const [playerId, idx] of session.seats) {
    const c = Array.from(conns.values()).find((c2) => c2.player.id === playerId);
    if (!c) continue;
    const v = session.engine.buildPlayerView(idx);
    const ex = state.extra;
    if (ex && Array.isArray(ex.boards)) v.extra = filterExtra(ex, idx);
    send(c.ws, { type: "game_state", payload: { enc: encryptText(JSON.stringify(v)) } });
  }
  const spectate = {
    phase: state.phase,
    currentTurn: state.currentTurn,
    winner: state.winner,
    log: (_b = (_a = state.extra) == null ? void 0 : _a.log) != null ? _b : []
  };
  for (const pid of session.spectators) {
    const c = Array.from(conns.values()).find((c2) => c2.player.id === pid);
    if (c) send(c.ws, { type: "spectate", payload: { enc: encryptText(JSON.stringify(spectate)) } });
  }
}
function endSession(notice) {
  if (!session) return;
  log(`\u6E38\u620F\u4F1A\u8BDD\u7ED3\u675F: ${notice}`);
  if (session.pendingTimer) {
    clearTimeout(session.pendingTimer);
    session.pendingTimer = null;
  }
  session = null;
  broadcast({ type: "back_to_lobby", payload: { notice } });
  broadcastLobby(notice);
}
function startReconnectWindow(playerId) {
  if (!session || session.pendingReconnect) return;
  session.pendingReconnect = playerId;
  log(`\u73A9\u5BB6 ${playerId} \u6389\u7EBF\uFF0C\u8FDB\u5165 30s \u91CD\u8FDE\u7A97\u53E3...`);
  broadcast({ type: "peer_disconnected", payload: { playerId, notice: "\u73A9\u5BB6\u6389\u7EBF\uFF0C\u7B49\u5F85\u91CD\u8FDE\u2026" } });
  broadcastConnState();
  session.pendingTimer = setTimeout(() => {
    if (session && session.pendingReconnect) {
      log(`\u73A9\u5BB6 ${playerId} \u91CD\u8FDE\u8D85\u65F6\uFF0C\u4E2D\u6B62\u5BF9\u5C40`);
      endSession("\u73A9\u5BB6\u6389\u7EBF\u8D85\u65F6");
    }
  }, 3e4);
}
function handleMsg(c, msg) {
  var _a, _b, _c, _d, _e, _f;
  const { ws, player } = c;
  c.lastSeen = Date.now();
  if (msg.type === "ping") {
    send(ws, { type: "pong" });
    return;
  }
  switch (msg.type) {
    case "register": {
      if (player.id !== hostId && roomPassword && msg.password !== roomPassword) {
        send(ws, { type: "error", payload: { message: "\u623F\u95F4\u53E3\u4EE4\u9519\u8BEF" } });
        log(`${player.id} \u53E3\u4EE4\u9519\u8BEF\uFF0C\u62D2\u7EDD\u63A5\u5165`);
        ws.close();
        return;
      }
      const savedId = String((_a = msg.playerId) != null ? _a : "");
      const cached = playersCache.get(savedId);
      const onlineSame = Array.from(conns.values()).some((c2) => c2.player.id === savedId);
      if (savedId && (cached || onlineSame)) {
        const old = Array.from(conns.values()).find((c2) => c2.player.id === savedId);
        if (old) {
          conns.delete(old.ws);
          old.ws.close();
        }
        player.id = savedId;
        if (cached) {
          player.name = cached.name;
          player.wantPlay = cached.wantPlay;
        }
        if (session && session.pendingReconnect === savedId) {
          if (session.pendingTimer) {
            clearTimeout(session.pendingTimer);
            session.pendingTimer = null;
          }
          session.pendingReconnect = null;
          log(`${savedId} \u91CD\u8FDE\u6210\u529F\uFF0C\u5BF9\u5C40\u7EE7\u7EED`);
          broadcastGameState();
          broadcastConnState();
        }
        log(`${player.id} \u8EAB\u4EFD\u6062\u590D${cached ? ` (${cached.name})` : "\uFF08\u5728\u7EBF\u62A2\u5360\uFF09"}`);
        broadcastLobby();
      }
      break;
    }
    case "kick_player": {
      if (player.id !== hostId) {
        send(ws, { type: "error", payload: { message: "\u53EA\u6709\u4E3B\u673A\u53EF\u4EE5\u8E22\u4EBA" } });
        return;
      }
      const targetId = String((_b = msg.playerId) != null ? _b : "");
      if (targetId === hostId) {
        send(ws, { type: "error", payload: { message: "\u4E0D\u80FD\u8E22\u4E3B\u673A\u81EA\u5DF1" } });
        return;
      }
      const target = Array.from(conns.values()).find((c2) => c2.player.id === targetId);
      if (!target) {
        send(ws, { type: "error", payload: { message: "\u73A9\u5BB6\u4E0D\u5B58\u5728" } });
        return;
      }
      playersCache.delete(targetId);
      kickedSet.add(targetId);
      log(`\u4E3B\u673A\u8E22\u51FA ${targetId}`);
      send(target.ws, { type: "kicked", payload: { notice: "\u5DF2\u88AB\u4E3B\u673A\u79FB\u51FA\u5927\u5385" } });
      if (session && session.seats.has(targetId)) {
        endSession(`\u73A9\u5BB6 ${targetId} \u88AB\u8E22\u51FA`);
      }
      target.ws.close();
      break;
    }
    case "rename": {
      const name = String((_c = msg.name) != null ? _c : "").trim().slice(0, 12) || player.name;
      player.name = name;
      log(`${player.id} \u6539\u540D \u2192 ${name}`);
      broadcastLobby();
      break;
    }
    case "set_seat": {
      player.wantPlay = !!msg.wantPlay;
      log(`${player.id} \u58F0\u660E ${player.wantPlay ? "\u60F3\u73A9" : "\u89C2\u6218"}`);
      broadcastLobby();
      break;
    }
    case "set_password": {
      if (player.id !== hostId) {
        send(ws, { type: "error", payload: { message: "\u53EA\u6709\u4E3B\u673A\u53EF\u4EE5\u8BBE\u7F6E\u53E3\u4EE4" } });
        return;
      }
      const pwd = String((_d = msg.password) != null ? _d : "").trim().slice(0, 8);
      roomPassword = pwd;
      log(`\u623F\u95F4\u53E3\u4EE4 ${pwd ? "\u5DF2\u8BBE\u7F6E" : "\u5DF2\u6E05\u9664"}`);
      broadcastLobby();
      break;
    }
    case "start_game": {
      if (player.id !== hostId) {
        send(ws, { type: "error", payload: { message: "\u53EA\u6709\u4E3B\u673A\u53EF\u4EE5\u53D1\u8D77\u6E38\u620F" } });
        return;
      }
      if (session) {
        send(ws, { type: "error", payload: { message: "\u5DF2\u6709\u8FDB\u884C\u4E2D\u7684\u6E38\u620F" } });
        return;
      }
      const valid = Array.isArray(msg.seats) ? msg.seats : [];
      const online = new Set(Array.from(conns.values()).map((x) => x.player.id));
      if (!valid.every((s) => online.has(s.playerId))) {
        send(ws, { type: "error", payload: { message: "\u5EA7\u4F4D\u5305\u542B\u4E0D\u5728\u7EBF\u73A9\u5BB6" } });
        return;
      }
      startSession(String(msg.gameId), valid);
      break;
    }
    case "action": {
      if (!session) return;
      const idx = session.seats.get(player.id);
      if (idx === void 0) return;
      const encStr = typeof ((_e = msg.payload) == null ? void 0 : _e.payload) === "string" ? msg.payload.payload : (_f = msg.payload) == null ? void 0 : _f.enc;
      let action = null;
      if (encStr) {
        const plain = decryptText(encStr);
        if (plain) {
          try {
            action = JSON.parse(plain);
          } catch {
            action = null;
          }
        }
      } else if (msg.payload && typeof msg.payload === "object") {
        action = msg.payload;
      }
      if (!action) {
        send(ws, { type: "error", payload: { message: "\u52A8\u4F5C\u89E3\u5BC6\u5931\u8D25" } });
        return;
      }
      action.playerIndex = idx;
      log(`action: ${action.type} by ${player.id}(\u4F4D\u7F6E${idx})`);
      void session.engine.dispatch(action).then((err) => {
        if (err) log(`dispatch \u62D2\u7EDD: ${err.message}`);
        if (!session) return;
        const state = session.engine.getState();
        broadcastGameState();
        if (state.phase === "ended") {
          endSession("\u5BF9\u5C40\u7ED3\u675F");
        }
      });
      break;
    }
    case "back_to_lobby": {
      if (player.id !== hostId) {
        send(ws, { type: "error", payload: { message: "\u53EA\u6709\u4E3B\u673A\u53EF\u4EE5\u4E2D\u6B62\u6E38\u620F" } });
        return;
      }
      endSession("\u4E3B\u673A\u4E2D\u6B62");
      break;
    }
    case "leave": {
      playersCache.delete(player.id);
      kickedSet.add(player.id);
      log(`${player.id} \u4E3B\u52A8\u79BB\u5F00`);
      if (session && session.seats.has(player.id)) {
        endSession(`\u73A9\u5BB6 ${player.id} \u79BB\u5F00`);
      }
      ws.close();
      break;
    }
  }
}
function removePlayer(c, reason) {
  conns.delete(c.ws);
  if (kickedSet.has(c.player.id)) {
    kickedSet.delete(c.player.id);
  } else {
    playersCache.set(c.player.id, { name: c.player.name, wantPlay: c.player.wantPlay });
  }
  log(`${c.player.id} \u65AD\u5F00 (${reason})\uFF0C\u5269\u4F59 ${conns.size}`);
  if (c.player.id === hostId && conns.size > 0) {
    hostId = Array.from(conns.values())[0].player.id;
    log(`\u4E3B\u673A\u8F6C\u79FB \u2192 ${hostId}`);
  }
  if (session) {
    if (session.seats.has(c.player.id)) {
      const reconnected = Array.from(conns.values()).some((x) => x.player.id === c.player.id);
      if (!reconnected) {
        startReconnectWindow(c.player.id);
      }
    }
    session.spectators = session.spectators.filter((p) => p !== c.player.id);
  }
  broadcastLobby();
}
var server = (0, import_http.createServer)(async (req, res) => {
  var _a;
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    urlPath = urlPath.replace(/^\/BoardGameSimulator/, "");
    if (urlPath === "/") urlPath = "/index.html";
    const file = import_path.default.normalize(import_path.default.join(DOCS, urlPath));
    if (!file.startsWith(DOCS)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const data = await import_fs.promises.readFile(file);
    const ext = import_path.default.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": (_a = MIME[ext]) != null ? _a : "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
var wss = new import_websocket_server.default({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
wss.on("connection", (ws) => {
  var _a, _b;
  const id = `player-${seq++}`;
  const maxCap = (_b = (_a = GAMES.filter((g) => g.ready)[0]) == null ? void 0 : _a.maxPlayers) != null ? _b : 2;
  const seated = Array.from(conns.values()).filter((c2) => c2.player.wantPlay).length;
  const player = { id, name: `\u73A9\u5BB6${seq}`, isHost: conns.size === 0, wantPlay: seated < maxCap };
  const c = { ws, player, lastSeen: Date.now() };
  conns.set(ws, c);
  if (conns.size === 1) hostId = id;
  log(`${id} \u52A0\u5165\u5927\u5385 (${conns.size} \u4EBA\u5728\u7EBF, \u4E3B\u673A=${hostId})`);
  send(ws, { type: "lobby_state", payload: { ...lobbyState(), you: id } });
  broadcastLobby();
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    handleMsg(c, msg);
  });
  ws.on("close", () => removePlayer(c, "close"));
  ws.on("error", () => removePlayer(c, "error"));
});
function broadcastConnState() {
  if (!session) return;
  const players = [];
  for (const playerId of session.seats.keys()) {
    const online = Array.from(conns.values()).some((c) => c.player.id === playerId);
    players.push({ playerId, state: online ? "online" : "reconnecting" });
  }
  broadcast({ type: "conn_state", payload: { players } });
}
server.listen(PORT, "::", () => {
  log(`\u5927\u5385\u670D\u52A1\u5668 listening [::]:${PORT} (v4+v6 \u53CC\u6808, \u9875\u9762 http://<ip>:${PORT}/ + ws \u5927\u5385)`);
  setInterval(() => {
    for (const c of conns.values()) {
      try {
        c.ws.ping();
      } catch {
      }
    }
  }, 3e4);
  setInterval(() => {
    const now = Date.now();
    for (const [ws, c] of conns) {
      if (now - c.lastSeen > 6e4) {
        log(`${c.player.id} \u5E94\u7528\u5C42\u5FC3\u8DF3\u8D85\u65F6\uFF0C\u5224\u5B9A\u6389\u7EBF`);
        ws.terminate();
      }
    }
  }, 3e4);
  setInterval(() => {
    const fresh = collectAddresses();
    if (JSON.stringify(fresh) !== JSON.stringify(ADDRS)) {
      ADDRS.v6 = fresh.v6;
      ADDRS.v4 = fresh.v4;
      log(`\u672C\u673A\u5730\u5740\u53D8\u5316: v6=[${ADDRS.v6.join(", ")}] v4=[${ADDRS.v4.join(", ")}]`);
      broadcastLobby("\u63A5\u5165\u5730\u5740\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u5206\u4EAB\u9080\u8BF7");
    }
  }, 6e4);
});
