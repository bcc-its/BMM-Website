'use strict';

angular.module('bmmLibApp')
  .factory('init', ['$http', '$q', '$location', 'bmmApi', 'locals', function ($http, $q, $location, bmmApi, locals) {

    var factory = {};

    //Common
    factory.user = {};
    factory.root = {};
    factory.translation = {};
    factory.mediaLanguage = 'nb'; //Fallback
    factory.ios = false;
    factory.config = {};
    factory.bible = {};
    factory.load = {
      percent: 0,
      progress: false,
      status: '',
      loaded: false,
      complete: $q.defer()
    };

    factory.promise = function(admin) {
      if (typeof admin==='undefined') { admin = false; }
      factory.authorize(admin);
      return factory.load.complete.promise;
    };

    //Admin only
    factory.titles = {};

    factory.authorize = function(admin) {

      if (factory.load.loaded) { return; }
      if (factory.load.progress) { return; }
      factory.load.progress = true;
      if (typeof admin==='undefined') { admin = false; }

      factory.load.status = 'Loading configuration';

      $http.get('scripts/config.json').success(function(config) {

        factory.config = config;
        bmmApi.serverUrl(config.serverUrl);
        bmmApi.setKeepAliveTime(config.keepAlive*1000);

        if ($location.protocol()!==config.protocol&&
            $location.port()!==config.developerPort) {
          var link = config.protocol+'://'+window.location.href.substr(5);
          link = link.replace('////','//'); //IE FIX
          window.location = link;
        }

        factory.load.status = 'Attempt to login';

        bmmApi.loginUser().done(function(user) {

          factory.load.percent+=20;
          var promises = [];

          // -- User
          factory.user = user;

          // -- Credentials
          bmmApi.setCredentials(user.username, user.token);

          // -- Root & Medialanguage (Depends on root)
          var rootLoaded = $q.defer(),
              mediaLanguageLoaded = $q.defer(),
              translationLoaded = $q.defer();
          promises.push(rootLoaded.promise);
          promises.push(mediaLanguageLoaded.promise);
          promises.push(translationLoaded.promise);

          factory.load.status = 'Fetching data';

          bmmApi.root().done(function(root) {

            factory.load.status = 'Root loaded';

            //Temporary remove arabic (@todo - remove later)
            $.each(root.languages, function(index) {
              if (this==='ar') {
                root.languages.splice(index,1);
              }
            });
            factory.root = root;
            rootLoaded.resolve();
            factory.load.percent+=20;

            // -- Medialanguage
            findMediaLanguage(user.languages,0, mediaLanguageLoaded);

            // -- Translation
            findTranslation(user.languages,0, translationLoaded);

          });

          // -- IOS (iphone, ipod, ipad ?)
          var ipad = (navigator.userAgent.match(/iPad/i) !== null),
              iphone = (navigator.userAgent.match(/iPhone/i) !== null),
              ipod = (navigator.userAgent.match(/iPod/i) !== null);
          if (ipad||iphone||ipod) {
            factory.ios = true;
          }

          // -- Date locals
          var localsLoaded = locals.fetchFiles(config.localsPath).then(function() {
            factory.load.percent+=10;
          });
          promises.push(localsLoaded);

          if (admin) {
            // -- Album titles
            var titlesLoaded = $q.defer();
            promises.push(titlesLoaded.promise);
            $.ajax({
              url: config.titlesAlbum,
              success: function(data) {
                factory.titles.album = data;
                titlesLoaded.resolve();
              }
            });

            // -- Bibleverses
            var bibleLoaded = $q.defer();
            promises.push(bibleLoaded.promise);
            translationLoaded.promise.then(function() {
              findBible(factory.user.languages, 0, bibleLoaded);
            });
          }

          $q.all(promises).then(function() {
            factory.load.complete.resolve();
            factory.load.loaded = true;
            factory.load.progress = false;
            factory.load.percent+=10;
            factory.load.status = 'Loading complete';
          });

        }).fail(function() {
          bmmApi.loginRedirect();
        });
      }).error(function() {
        alert('Config file is missing!');
      });
    };

    var findMediaLanguage = function(lang, index, promise) {

      factory.load.status = 'Find medialanguage';

      if (typeof lang[index]==='undefined') {
        factory.mediaLanguage = 'nb'; //Fallback
        promise.resolve();
      } else if ($.inArray(lang[index],factory.root.languages)!==-1) {
        factory.mediaLanguage = lang[index];
        promise.resolve();
        factory.load.percent+=20;
      } else {
        findMediaLanguage(lang, index+1, promise);
      }
    };

    var findTranslation = function(lang, index, promise) {

      factory.load.status = 'Fetch translation';

      if (typeof lang[index]==='undefined'||lang.length<1) {
        lang[index] = 'nb'; //Fallback
      }

      $.ajax({
        url: factory.config.translationFolder+lang[index]+'.json',
        error: function() {
          findTranslation(lang, (index+1), promise);
        },
        success: function(data) {
          factory.translation = data;
          promise.resolve();
          factory.load.percent+=20;
        }
      });
    };

    var findBible = function(lang, index, promise) {

      factory.load.status = 'Fetch bible';

      if (typeof lang[index]==='undefined'||lang.length<1) {
        lang[index] = 'nb'; //Fallback
      }

      $.ajax({
        url: factory.config.biblePath+lang[index]+'.json',
        error: function() {
          findBible(lang, (index+1), promise);
        },
        success: function(data) {
          factory.bible = data;
          promise.resolve();
        }
      });
    };

    return factory;
  }]);