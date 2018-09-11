/* eslint-disable */
import * as child_process from 'node-services/lib/child_process';
import * as net from 'node-services/lib/net';
import electron from 'node-services/lib/electron';

import { METADATA } from './metadata';

const PREFIX = '/vs';

const window = window || self;
window.global = window;

export default function() {
  var IS_FILE_PROTOCOL = window.location.protocol === 'file:';
  var DIRNAME = null;
  if (IS_FILE_PROTOCOL) {
    var port = window.location.port;
    if (port.length > 0) {
      port = ':' + port;
    }
    DIRNAME =
      window.location.protocol +
      '//' +
      window.location.hostname +
      port +
      window.location.pathname.substr(
        0,
        window.location.pathname.lastIndexOf('/')
      );

    var bases = document.getElementsByTagName('base');
    if (bases.length > 0) {
      DIRNAME = DIRNAME + '/' + bases[0].getAttribute('href');
    }
  }

  var LOADER_OPTS = (function() {
    function parseQueryString() {
      var str = window.location.search;
      str = str.replace(/^\?/, '');
      var pieces = str.split(/&/);
      var result = {};
      pieces.forEach(function(piece) {
        var config = piece.split(/=/);
        result[config[0]] = config[1];
      });
      return result;
    }
    var overwrites = parseQueryString();
    var result = {};
    result['editor'] = overwrites['editor'] || 'src';
    METADATA.PLUGINS.map(function(plugin) {
      result[plugin.name] = overwrites[plugin.name] || 'npm/dev';
    });
    return result;
  })();
  function toHREF(search) {
    var port = window.location.port;
    if (port.length > 0) {
      port = ':' + port;
    }
    return (
      window.location.protocol +
      '//' +
      window.location.hostname +
      port +
      window.location.pathname +
      search +
      window.location.hash
    );
  }

  function Component(name, modulePrefix, paths, contrib) {
    this.name = name;
    this.modulePrefix = modulePrefix;
    this.paths = paths;
    this.contrib = contrib;
    this.selectedPath = LOADER_OPTS[name];
  }
  Component.prototype.isRelease = function() {
    return /release/.test(this.selectedPath);
  };
  Component.prototype.getResolvedPath = function() {
    var resolvedPath = this.paths[this.selectedPath];
    if (
      this.selectedPath === 'npm/dev' ||
      this.selectedPath === 'npm/min' ||
      this.isRelease()
    ) {
      if (IS_FILE_PROTOCOL) {
        resolvedPath = DIRNAME + '/../' + resolvedPath;
      } else {
        resolvedPath = '/monaco-editor/' + resolvedPath;
      }
    } else {
      if (IS_FILE_PROTOCOL) {
        resolvedPath = DIRNAME + '/../..' + resolvedPath;
      }
    }
    return resolvedPath;
  };
  Component.prototype.generateLoaderConfig = function(dest) {
    dest[this.modulePrefix] = this.getResolvedPath();
  };
  Component.prototype.generateUrlForPath = function(pathName) {
    var NEW_LOADER_OPTS = {};
    Object.keys(LOADER_OPTS).forEach(function(key) {
      NEW_LOADER_OPTS[key] =
        LOADER_OPTS[key] === 'npm/dev' ? undefined : LOADER_OPTS[key];
    });
    NEW_LOADER_OPTS[this.name] = pathName === 'npm/dev' ? undefined : pathName;

    var search = Object.keys(NEW_LOADER_OPTS)
      .map(function(key) {
        var value = NEW_LOADER_OPTS[key];
        if (value) {
          return key + '=' + value;
        }
        return '';
      })
      .filter(function(assignment) {
        return !!assignment;
      })
      .join('&');
    if (search.length > 0) {
      search = '?' + search;
    }
    return toHREF(search);
  };
  Component.prototype.renderLoadingOptions = function() {
    return (
      '<strong style="width:130px;display:inline-block;">' +
      this.name +
      '</strong>:&nbsp;&nbsp;&nbsp;' +
      Object.keys(this.paths)
        .map(
          function(pathName) {
            if (pathName === this.selectedPath) {
              return '<strong>' + pathName + '</strong>';
            }
            return (
              '<a href="' +
              this.generateUrlForPath(pathName) +
              '">' +
              pathName +
              '</a>'
            );
          }.bind(this)
        )
        .join('&nbsp;&nbsp;&nbsp;')
    );
  };

  var RESOLVED_CORE = new Component('editor', 'vs', METADATA.CORE.paths);
  self.RESOLVED_CORE_PATH = RESOLVED_CORE.getResolvedPath();
  var RESOLVED_PLUGINS = METADATA.PLUGINS.map(function(plugin) {
    return new Component(
      plugin.name,
      plugin.modulePrefix,
      plugin.paths,
      plugin.contrib
    );
  });

  function loadScript(path, callback) {
    if (typeof document !== 'undefined') {
      var script = document.createElement('script');
      script.onload = callback;
      script.async = true;
      script.type = 'text/javascript';
      script.src = path;
      document.head.appendChild(script);
    } else {
      self.importScripts(path);
      callback();
    }
  }

  (function() {
    if (process.env.DEBUG_VERSION) {
      var allComponents = [RESOLVED_CORE];
      if (!RESOLVED_CORE.isRelease()) {
        allComponents = allComponents.concat(RESOLVED_PLUGINS);
      }

      var div = document.createElement('div');
      div.style.position = 'fixed';
      div.style.top = 0;
      div.style.right = 0;
      div.style.background = 'lightgray';
      div.style.padding = '5px 20px 5px 5px';
      div.style.zIndex = '1000';

      div.innerHTML =
        '<ul><li>' +
        allComponents
          .map(function(component) {
            return component.renderLoadingOptions();
          })
          .join('</li><li>') +
        '</li></ul>';

      document.body.appendChild(div);

      var aElements = document.getElementsByTagName('a');
      for (var i = 0; i < aElements.length; i++) {
        var aElement = aElements[i];
        if (aElement.className === 'loading-opts') {
          aElement.href += window.location.search;
        }
      }
    }
  })();

  return function(callback, PATH_PREFIX) {
    PATH_PREFIX = PATH_PREFIX || '';

    window.nodeRequire = path => {
      // Trick AMD in that this is the node require function
      console.log('nodeRequire', path);

      if (path.endsWith('package.json')) {
        return require('vscode/package.json');
      }
      if (path.endsWith('product.json')) {
        return require('vscode/product.json');
      }

      if (path === 'module') {
        return { _load: window.nodeRequire };
      }
    };
    loadScript(
      PATH_PREFIX + RESOLVED_CORE.getResolvedPath() + '/loader.js',
      function() {
        var loaderPathsConfig = {};
        if (!RESOLVED_CORE.isRelease()) {
          RESOLVED_PLUGINS.forEach(function(plugin) {
            plugin.generateLoaderConfig(loaderPathsConfig);
          });
        }
        RESOLVED_CORE.generateLoaderConfig(loaderPathsConfig);

        console.log('LOADER CONFIG: ');
        console.log(JSON.stringify(loaderPathsConfig, null, '\t'));

        self.require.toUrl = p => {
          return require('path').join('/vs', p);
        };

        self.require.define('path', [], () => {
          const path = require('path');
          return {
            ...path,
            posix: path,
          };
        });

        self.require.define('util', [], () => {
          return require('util');
        });

        self.require.define('string_decoder', [], () => {
          return require('string_decoder');
        });

        self.require.define('crypto', [], () => {
          return {};
        });

        self.require.define('node-pty', [], () => {
          return {};
        });

        self.require.define('os', [], () => {
          const os = require('os-browserify');
          return os;
        });

        self.require.define('vs/base/node/encoding', [], () => {
          return {
            UTF8: 'utf8',
            UTF8_with_bom: 'utf8bom',
            UTF16be: 'utf16be',
            UTF16le: 'utf16le',
          };
        });

        self.require.define('child_process', [], () => {
          return child_process;
        });

        self.require.define('electron', [], () => {
          return electron;
        });

        self.require.define('net', [], () => {
          return net;
        });

        self.require.define('fs', [], () => {
          return BrowserFS.BFSRequire('fs');
        });

        self.require.define('semver', [], () => {
          return require('semver');
        });

        self.require.define('assert', [], () => {
          return require('assert');
        });

        self.require.define('vs/platform/request/node/request', [], () => {
          // TODO
          return {};
        });

        self.require.define('vs/base/node/request', [], () => {
          // TODO
          return {};
        });

        self.require.define('vs/base/node/proxy', [], () => {
          // TODO
          return {};
        });

        self.require.define('yauzl', [], () => {
          // TODO: install yauzl
        });

        console.log('setting config');
        self.require.config({
          paths: loaderPathsConfig,
        });

        self.require(['vs/editor/editor.main'], function() {
          if (!RESOLVED_CORE.isRelease()) {
            // At this point we've loaded the monaco-editor-core
            self.require(
              RESOLVED_PLUGINS.map(function(plugin) {
                return plugin.contrib;
              }),
              function() {
                // At this point we've loaded all the plugins
                callback();
              }
            );
          } else {
            callback();
          }
        });

        // callback();
      }
    );
  };
}
