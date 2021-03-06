/*
 * Initializes the model/data layer.
 * @param app - The Scroll app instance
 */
module.exports = function(app) {
  // load the model layer module
  var data = require(app.config.model.module),
      appModels = app.util.getJSFiles(
        app.config.__path + '/' + app.config.model.folder
      );

  var model = null;
  for(var m in appModels) {
    model = require(appModels[m]);

    if(typeof model === 'function') {
      data.load(m, model);
    } else if(typeof model === 'object') {
      data.load(model.name || m, model.load);
    }
  }

  data.connect.call(app, app.config.model.connection,
    function() {
      app.log.info('Connected to ' + app.config.model.connection);
    },
    function(err) {
      console.error(err);
    });

  // return the models for use
  return data.models;
};
