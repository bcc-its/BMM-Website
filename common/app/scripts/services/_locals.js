'use strict';

angular.module('bmmLibApp')
  .factory('_locals', [ '$http', '$q', '_api', function ($http, $q, _api) {
    var factory = {},
        locals = {};
    locals.date = {};

    factory.fetchFiles = function(url) {

      var localsLoaded = $q.defer(), //Will be resolved at a later time
          folderLoaded = _api.root().done(function(root) {

        var promises = [];
        var expectedResponses = root.languages.length;
        var results = 1;

        $.each(root.languages, function() {
          if (this!=='ar') {
            promises.push($http.get(url+this+'.json')
              .success(function(file) {
                if (typeof file.id!=='undefined'&&typeof file.date!=='undefined') {
                  locals.date[file.id] = file.date;
                }
                results++;
                if (results>=expectedResponses) {
                  localsLoaded.resolve();
                }
              })
              .error(function() {
                results++;
                if (results>=expectedResponses) {
                  localsLoaded.resolve();
                }
              })
            );
          }
        });

      });

      return $q.all([localsLoaded.promise]);
    };

    factory.getAll = function() {
      return locals;
    };

    return factory;

  }]);