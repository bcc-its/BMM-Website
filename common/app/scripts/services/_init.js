'use strict';

angular.module('bmmLibApp')
  .factory('_init', function ($http, $q, $location, _session, _api, _locals, $analytics) {

    var factory = {},
        loginAttempts = 3;

    // Common
    factory.user = {};
    factory.admin = false;
    factory.root = {};
    factory.translation = {};
    factory.translations = {}; // Object with actual translations
    factory.isIOS = false;
    factory.config = {};
    factory.bible = {};
    factory.downloadInfo = {
      showPopup: false,
      hasDownloadPermission: false,
      type: undefined,
      link: undefined,
      show: function(type, downloadLink) {
        factory.downloadInfo.showPopup = true;
        factory.downloadInfo.type = type;
        factory.downloadInfo.link = downloadLink;
      },
      hide: function() {
        factory.downloadInfo.showPopup = false;
      }
    };

    factory.load = {
      percent: 0,
      progress: false,
      status: '',
      loaded: false,
      complete: $q.defer()
    },
    factory.blockingLoad = {
      loading: false
    };

    factory.promise = function(admin) {
      factory.authorize(admin);
      return factory.load.complete.promise;
    };

    // Admin only
    factory.titles = {};

    factory.authorize = function(admin, attempt) {

      // -- Check if authorization has been attempted earlier
      if (typeof attempt!=='undefined'&&attempt>loginAttempts) {
        return false;
      } else if (typeof attempt==='undefined') {
        attempt = 0;
      }

      if (factory.load.loaded) { return; }
      if (factory.load.progress) { return; }
      factory.load.progress = true;
      if (typeof admin==='undefined') { admin = false; }

      factory.load.status = 'Loading configuration';

      // -- Load configurations
      $http.get('scripts/config.json').success(function(config) {

        factory.config = config;
        _api.serverUrl(config.knownServerUrls[config.serverUrlIndex], config.fileServerUrl);
        if(config.requestTimeout) {
          _api.setRequestTimeout(config.requestTimeout*1000);
        }

        // -- Secure that the correct protocol given by configuration is used
        if ($location.protocol()!==config.protocol&&
            $location.port()!==config.developerPort) {
          var link = config.protocol+'://'+window.location.href.substr(5);
          link = link.replace('////','//'); //IE FIX
          window.location = link;
        }

        factory.load.status = 'Attempt to login';

        // -- Attempt to login
        _api.loginUser().then(function(user) {
          factory.load.percent+=25;
          var promises = [];

          $('body').append('<script id="script-bcc-topbar" data-authentication-type="SPA" data-authentication-location="oidc.access_token" src="https://widgets.bcc.no/widgets/TopbarJs"></script>');

          // -- User
          factory.user = user;

          // -- Admin
          factory.admin = isAdmin(user.roles);
          factory.downloadInfo.hasDownloadPermission = isDownloader(user.roles);

          //Set the username for the angulartics reports:
          $analytics.setUsername(user.username);

          // -- Root & contentLanguage (Depends on root)
          var rootLoaded = $q.defer(),
              localsLoaded = $q.defer();
          promises.push(rootLoaded.promise);
          promises.push(localsLoaded.promise);

          factory.load.status = 'Fetching data';

          _api.root().done(function(root) {
            factory.load.status = 'Root loaded';

            // Temporary remove zxx because it's for multilingual content (@todo - remove later)
            var hiddenLanguages = ['zxx'];

            // Iterate backwards because we're deleting elements.
            for (var i = root.languages.length -1; i >= 0 ; i--){
              var language = root.languages[i];
                if (hiddenLanguages.indexOf(language) !== -1) {
                    root.languages.splice(i, 1);
                }
            }

            factory.root = root;

            _session.restoreSession(user.username, [], factory.root.languages);

            if (admin)
              _api.setContentLanguages(root.languages);
            else
              _api.setContentLanguages(_session.current.contentLanguages);
            _api.appendUnknownLanguage = true;

            // Use the top language as podcastLanguage
            factory.podcastLanguage = _session.current.contentLanguages[0];

            rootLoaded.resolve();
            factory.load.percent+=25;

            // -- Date locals
            _locals.fetchFiles(config.localsPath, _session.current.websiteLanguage).then(function() {
              localsLoaded.resolve();
              factory.load.percent+=25;
            });

            if (admin){
              factory.titles.album = {};
              // -- Album titles
              $.each(root.languages, function(key, language){
                $.ajax({
                  url: config.titlesAlbum.replace('album.json', language + '.json'),
                  success: function(data) {
                    $.each(data, function(key, value){
                      var item = factory.titles.album[key];
                      if(!item){
                        factory.titles.album[key] = {};
                      }
                      factory.titles.album[key][language] = value;
                    });
                  }
                });
              });
            }
          });

          // -- isIOS (iphone, ipod, ipad ?)
          var ipad = (navigator.userAgent.match(/iPad/i) !== null),
              iphone = (navigator.userAgent.match(/iPhone/i) !== null),
              ipod = (navigator.userAgent.match(/iPod/i) !== null);
          if (ipad||iphone||ipod) {
            factory.isIOS = true;
          }

          if (admin) {
            // -- Bibleverses
            var bibleLoaded = $q.defer();
            promises.push(bibleLoaded.promise);
            findBible([], 0, bibleLoaded);
          }

          var searchObject = $location.search();
          console.log("hide_menu",searchObject, searchObject.hide_menu);
          if (searchObject.hide_menu) {
            factory.hide_menu = true;
          }

          $q.all(promises).then(function() {
            factory.load.complete.resolve();
            factory.load.loaded = true;
            factory.load.progress = false;
            factory.load.percent+=25;
            factory.load.status = 'Loading complete';
          });

        }, function(error) {
          console.error("not able to login user");
        });
      }).error(function() {
        factory.load.progress = false;
        factory.authorize(admin, (attempt+1));
      });
    };

    var isAdmin = function(roles) {
      var isAdmin = false;
      $.each(roles, function() {
        if (this==='ROLE_ADMINISTRATOR') { isAdmin = true; }
      });
      return isAdmin;
    };
    var isDownloader = function(roles) {
      var isDownloader = false;
      $.each(roles, function() {
        if (this==='ROLE_DOWNLOADER') { isDownloader = true; }
      });
      return isDownloader || isAdmin(roles);
    }

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
  });
