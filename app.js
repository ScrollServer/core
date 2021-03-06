var fs = require('fs'),
    path = require('path'),
    express = require('express'),
    passport = require('passport'),
    async = require('async'),
    marked = require('marked');

/**
 * Loads in the configuration then extends and updates it based on the view
 * and application overrides.d
 * @private
 */
var configure = function(config) {
  // load the default/base config
  this.config = require(__dirname + '/config');

  // base application path
  this.config.__path = process.cwd();

  // core version
  this.config.__version = require(__dirname + '/package.json').version;

  // load the applicaiton config
  var appConfig = path.resolve('./config.json');
  if(fs.existsSync(appConfig)) {
    this.config = this.util.extend(this.config, require(appConfig));
  }

  this.config = this.util.extend(this.config, (config || {}));

  // load the view
  if(!this.config.view.hasOwnProperty('module')) {
    throw 'No view layer found.';
  }

  this.config.view.path = __dirname +
    '/node_modules/' + this.config.view.module;

  this.config.view = this.view = this.util.extend(
    this.config.view,
    require(this.config.view.module)(this)
  );

  // set the logging options if given in the config
  if(this.config.log) {
    if(typeof this.config.log.level === 'number') {
      this.log.level = this.config.log.level;
    }

    if(typeof this.config.log.color === 'boolean') {
      this.log.color = this.config.log.color;
    }
  }

  // print engine info
  console.log(this.info());
};

/**
 * Initializes the server.
 * @private
 */
var initialize = function() {
  // load the express extentions/shims
  require('./lib/express_ext')(this.app);

  this.app.use(require('static-favicon')(this.config.favicon));

  // load some required/common middleware
  var bodyParser = require('body-parser');

  this.app.use(bodyParser.urlencoded({extended:true}));
  this.app.use(bodyParser.json());
  this.app.use(passport.initialize());

  // set up the paths for static files
  var view = this.config.view;
  this.app.use(express.static('./public'));             // application
  this.app.use(express.static(view.path + '/public')); // theme

  // set up the view engine, if any
  if(typeof view.engine !== 'undefined' && view.engine !== null) {
    this.app.engine(view.ext, view.engine);
    this.app.set('view engine', view.ext);
    this.app.set('views', [
      './views',             // application
      view.path + '/views', // theme
    ]);
  }

  // set up passport to use basic auth
  var BasicStrategy = require('passport-http').BasicStrategy;

  passport.use(new BasicStrategy(
    function(username, password, done) {
      done(null, (username === this.username && password === this.password));
    }.bind(this.config.authentication)
  ));

  // convenience for passport digest authentication
  this.restrict = passport.authenticate('basic', {session:false});
};

/**
 * Scroll Core Class
 * @class
 * @name Scroll
 * @param [config] {object} - base configuration for the Scroll server.
 */
var Scroll = function(config) {
  // utilities
  this.util = require('./lib/util');
  this.log = require('./lib/logger');

  // express applicaiton
  this.app = express();

  // convenience access to the router object
  this.Router = express.Router;

  // a few proxies for convenience
  this.post = this.app.post.bind(this.app);
  this.put = this.app.put.bind(this.app);
  this.delete = this.app.delete.bind(this.app);
  this.use = this.app.use.bind(this.app);
  this.locals = this.app.locals;

  // set up a few options
  if(typeof config === 'object') {
    // set up the scroll body parsing
    this.parse = config.parse || this.parse;
  }

  // configure the applicaiton
  configure.call(this, config);

  // loads the controllers
  this.controllers = require('./controllers/controllers')(this);

  // initialize the server
  initialize.call(this);
};

/**
 * Returns a nice string of basic infomation of the scroll instance.
 * @memberof Scroll
 */
Scroll.prototype.info = function() {
  var infoText = '';

  infoText += ' _______________________________\n';
  infoText += '/  _\\                           \\\n';
  infoText += '\\ (_/___________________________/\n';
  infoText += ' \\       ___             _ _   \\\n';
  infoText += '  \\     / __| __ _ _ ___| | |   \\\n';
  infoText += '   \\    \\__ \\/ _| \'_/ _ \\ | |    \\\n';
  infoText += '  __\\   |___/\\__|_| \\___/_|_|     \\\n';
  infoText += ' / )_\\  Engine                     \\\n';
  infoText += ' \\___/_____________________________/\n';
  infoText += ' Version ' + this.config.__version + '\n';
  infoText += ' Model Module: ' + this.config.model.module + '\n';
  infoText += ' View Module: ' + this.config.view.module + '\n';
  infoText += ' Environment: ' + (process.env.NODE_ENV || 'Not Set') + '\n';

  return infoText;
};

/**
 * Returns the number of miliseconds since the server was started.
 * @memberof Scroll
 */
Scroll.prototype.uptime = function() {
  return Date.now() - this.__started;
};

/**
 * Convenience function to add a GET route to the server, which binds the
 * handler to the server and checks for a view override.
 * @memberof Scroll
 * @param route {string} - The route definition.
 * @param [middleware] {mixed} - The express-compatible middleware to use
 * with the route.
 * @param handler {function(req, res)} - The handler for the route.
 * @param [view] {string} - The view used for the route. Used to allow
 * views and applications to override the route handler.
 */
Scroll.prototype.get = function(route, middleware, handler, view) {
  var hasMiddleware = false;

  // if a middleware and a handler is provided
  if(typeof middleware === 'function' && typeof handler === 'function') {
    hasMiddleware = true;
  }

  // if only a route and handler were provided
  if(typeof middleware === 'function' && typeof handler === 'undefined') {
    handler = middleware;
  }

  // if a handler and a view is provided
  if(typeof middleware === 'function' && typeof handler === 'string') {
    view = handler;
    handler = middleware;
  }

  // check if the handler for the view has been overridden
  if(view && this.config.view.views.hasOwnProperty(view)) {
    // allows the configuration to prevent adding a view-based route
    if(this.config.view.views[view].override) {
      return;
    }

    handler = this.config.view.views[view].handler || handler;
  }

  handler = handler.bind(this);

  if(hasMiddleware) {
    this.app.get(route, middleware, handler);
  } else {
    this.app.get(route, handler);
  }
};

/**
 * Loads and returns a plugin
 * @memberof Scroll
 * @param name {string} - The node module name of the plugin to load.
 */
Scroll.prototype.plugin = function(name) {
  return require(name)(this);
};

/**
 * Parses a scroll's content. Defaults to markdown parsing.
 * @param content {string} - The text to parse.
 */
Scroll.prototype.parse = function(scroll) {
  scroll.raw = scroll.body;
  scroll.body = marked(scroll.body);

  return scroll;
};

/**
 * Helper that renders a view, but passes the view config along with the
 * base data to the view.
 * @param res {object} - The response object from the route handler.
 * @param view {string} - The name of the view to render.
 * @param data {object} - The data to pass along with the view configuration.
 */
Scroll.prototype.render = function(res, view, data) {
  var config = this.config.view.views[view];
  res.render(config.view, this.util.extend(config, data));
};

/**
 * Starts the Scroll server.
 * @memberof Scroll
 * @param [port] {number} - The port the server should listen on.
 * @param [callback] {startCallback} - Callback called when the server has
 * started.
 */
Scroll.prototype.start = function(port, callback) {

  // check the port passed in
  var listenTo = port;
  if(typeof port !== 'number') {
    if(typeof port === 'function') {
      callback = port;
    }

    listenTo = process.env.PORT || 8181;
  }

  // add the server routes
  require('./routes/routes')(this);

  this.app.listen(listenTo, null, null, function() {
    this.__started = Date.now();

    this.log.info('Scroll Server listening on port ' + listenTo);

    if(typeof callback === 'function') {
      callback();
    }
  }.bind(this));
};

/**
 * Scroll factory
 * @param [config] {object} - Configuration based to the scroll server
 * created.
 */
module.exports = function(config) {
  return new Scroll(config);
};
