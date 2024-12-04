'use strict';

angular.module('bmmLibApp')
  .factory('_api', function ($timeout, $rootScope, _api_queue, $analytics, ngOidcClient, $q, $location) {

  var factory = {},
      oidcUser = {},
      serverUrl = 'http://localhost/',
      fileServerUrl = 'http://localhost/',
      requestTimeout,
      responseCache = {},
      contentLanguages = [];

  //This variable indicates whether the "unknown" language ("zxx", used for non-lingual content)
  //should be appended with every request by default.
  factory.appendUnknownLanguage = false; //Fallback to false

  factory.cachingEnabled = false;

  factory.serverUrl = function(url, fileUrl) {
    serverUrl = url;
    fileServerUrl = fileUrl;
  };

  factory.prepareRequest = function(customXhrOptions) {
    var xhrOptions, defaultXhrOptions, supportedMethods;

    //The default options for every request
    defaultXhrOptions = {
      crossDomain: true,
      dataType: customXhrOptions.method === 'GET' ? 'json' : 'html',
      timeout: requestTimeout,
      headers: {
        'Authorization': factory.getAuthorizationHeader(),
        //Add this to all requests, because if we don't add this header, the browser will
        //add one with it's own languages. It will not harm to leave it here for all the requests,
        //even though it's not required.
        'Accept-Language': contentLanguages
      },
      xhrFields: {
      }
    };

    function merge(obj1,obj2){ // Custom merge function
        var result = {}; // return result
        for(var i in obj1){      // for every property in obj1
            if((i in obj2) && (typeof obj1[i] === 'object') && (i !== null) && !$.isArray(obj1[i])){

              //Arrays are not merged, they're treated like any other primitive property.
              //This is because of the Accept-Languages property.

                result[i] = merge(obj1[i],obj2[i]); // if it's an object, merge
            } else {
               result[i] = obj1[i]; // add it to result
            }
        }
        for(i in obj2){ // add the remaining properties from object 2
            if(i in result){ //conflict
                continue; //obj1 has higher priority, therefore skip.
            }
            result[i] = obj2[i];
        }
        return result;
    }


    //copy all the properties from the customXhrOptions to the xhrOptions
    //So that the xhrOptions object acts as a default/fallback
    xhrOptions = merge(customXhrOptions, defaultXhrOptions);

    //require an url
    if(typeof xhrOptions.url !== 'string') {
      throw new Error('Cannot create a request without an URL');
    }

    //link is not supported by Firefox, so not adding it here.
    //Firefox issue with LINK is fixed, and the method is therefore supported.
    //Only the methods needed by the BMM-API are supported...
    supportedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'LINK'];

    //require a method, don't default to GET.
    //This should be supplied with every request.
    if(typeof xhrOptions.method !== 'string' || supportedMethods.indexOf(xhrOptions.method) === -1) {
      throw new Error('The HTTP method: ' + xhrOptions.method + ' is not supported');
    }

    //Check if the language code for non-lingual content should be appended to the languages array.
    if(factory.appendUnknownLanguage && xhrOptions.headers) {
      var languages = xhrOptions.headers['Accept-Language'];
      //Only append the language if the languages is an array.
      if($.isArray(languages)) {
        xhrOptions.headers['Accept-Language'] = languages.concat(['zxx']);
      }
    }

    return xhrOptions;
  };

  factory.addToQueue = function(customXhrOptions) {
    var xhrOptions = factory.prepareRequest(customXhrOptions);

    if(factory.shouldBeCached(xhrOptions) && responseCache[getFullUrl(xhrOptions)]) {
      return responseCache[getFullUrl(xhrOptions)];
    }

    var promise = _api_queue.addRequest(xhrOptions).done(function(data) {
      setTimeout(function() {
        $rootScope.safeApply();
      });
    });

    if(factory.shouldBeCached(xhrOptions)) {
      responseCache[getFullUrl(xhrOptions)] = promise;
    }

    return promise;
  };

  factory.shouldBeCached = function(xhrOptions) {
    if(!factory.cachingEnabled) return false;

    //Don't cache playlists because the user often interacts with it and it may change.
    if(getFullUrl(xhrOptions).match(/track_collection/)) return false;
    if(getFullUrl(xhrOptions).match(/groupgoal/)) return false;

    if(xhrOptions.method !== 'GET') return false;

    return true;
  };

  function getFullUrl(xhrOptions) {
    if(!xhrOptions.data) return xhrOptions.url;

    var params = typeof xhrOptions.data === 'string' ? xhrOptions.data : $.param(xhrOptions.data)
    return xhrOptions.url + params;
  }

  /**
   * Send an XHR request with some special defined defaults and requirements.
   * @param  {object} customXhrOptions        And Object with custom properties that override the default. Same object as jQuery ajax
   * @param  {function|boolean} errorHandler  Either a boolean (false) indicating that there should be no errorHeandler
   * @return {xhrPromise}                     Returns the jqXHR instance that is returned by $.ajax()
   */
  factory.sendXHR = function(customXhrOptions, errorHandler) {

    var xhrOptions = factory.prepareRequest(customXhrOptions);

    errorHandler = errorHandler || factory.exceptionHandler;

    var time = Date.now();

    var promise = $.Deferred();
    $.ajax(xhrOptions)
    .then(promise.resolve, function(xhr, arg2, arg3){
      if (xhr.status===401) {
        // This can happen when the browser looses focus past the token expiration.
        // oidc-client knows about but hasn't fixed it yet: https://github.com/IdentityModel/oidc-client-js/issues/143
        ngOidcClient.manager.signinSilent().then(function() {
          xhrOptions.headers.Authorization = factory.getAuthorizationHeader();
          $.ajax(xhrOptions).then(promise.resolve, promise.reject);
        });
      } else {
        promise.reject(xhr, arg2, arg3);
      }
    });

    promise.done(function(data, textStatus, XMLHttpRequest) {
      $analytics.userTimings({
        timingCategory: 'api',
        timingVar: XMLHttpRequest.status + " - " + this.url,
        timingValue: Date.now() - time
      });
    });
    promise.fail(function (XMLHttpRequest) {
      if (XMLHttpRequest.readyState == 4) {
        $analytics.userTimings({
          timingCategory: 'api',
          timingVar: XMLHttpRequest.status + " - " + this.url,
          timingValue: Date.now() - time
        });
        // HTTP error (can be checked by XMLHttpRequest.status and XMLHttpRequest.statusText)
      }
      else if (XMLHttpRequest.readyState == 0) {
        ga('send', 'exception', {
          'exDescription': "_api.sendXHR: " + XMLHttpRequest.status + " - " + XMLHttpRequest.url,
          'exFatal': false
        });
        // Network error (i.e. connection refused, access denied due to CORS, etc.)
      }
      else {
        ga('send', 'exception', {
          'exDescription': "_api.sendXHR: " + XMLHttpRequest.url,
          'exFatal': false
        });
      }
    });

    //If errorHandler == false or anything but a function, no errorHandler should be used.
    if(typeof errorHandler === 'function') {
      promise.fail(errorHandler);
    }

    return promise;
  };

  //decorate requestExecutor of the _api_queue with
  //the factory.sendXHR method.
  _api_queue.requestExecutor = factory.sendXHR;

  factory.getserverUrli = function() {
    return serverUrl;
  };

  factory.getProtectedFileServerUrl = function() {
    return serverUrl + "file/protected/";
  };

  factory.setRequestTimeout = function(time) {
    requestTimeout = time;
  };

  factory.exceptionHandler = function(xhr) {
    if (xhr.status===401) {
      console.error("Unauthorized");
    }
  };

  factory.addLanguagesToDownloadUrl = function(downloadUrl) {
    return downloadUrl + '?languages[]=' + contentLanguages.join('&languages[]=');
  };

  //Doesnt need to be secured
  factory.secureImage = function(image) {
    return image;
  };

  factory.getAuthorizationHeader = function() {
    return "Bearer " + oidcUser.access_token;
  };

  factory.getPersonId = function() {
    return oidcUser.profile["https://members.bcc.no/app_metadata"].personId;
  };

  factory.addAuthorizationQueryString = function(url) {
    if (url.indexOf('auth=') == -1) {
      var divider = url.indexOf('?') == -1 ? '?' : '&';
      return url + divider + "auth=" + encodeURIComponent(factory.getAuthorizationHeader());
    } else {
      return url;
    }
  };

  factory.addLastChangedQueryString = function(url) {
    if (url.indexOf('last-changed') == -1) {
      var divider = url.indexOf('?') == -1 ? '?' : '&';
      var unixTimestamp = Math.floor(Date.now() / 1000);
      return url + divider + "last-changed=" + unixTimestamp;
    }
  }

  factory.setContentLanguages = function(languages) {
    contentLanguages = languages;
  };

  factory.getContentLanguages = function() {
    return contentLanguages || '';
  };

  /** Get the basic information about the API **/
  factory.root = function() {

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl,
      //No xhrFields, override default
      xhrFields: {}
    });

  };

  /** Save a new album **/
  factory.albumPost = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'album/',
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Get the latest albums of a specific type (Default is all types) **/
  factory.albumLatest = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'album/',
      data: $.param(options)
    });

  };

  /** Get all albums in a year **/
  factory.albumPublishedYear = function(year, options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    size                      Integer         \d+
     *    from                      Integer         \d+
     *    content-type              Array(string)   song|speech|audiobook|singsong|video
     *    media-type                Array(string)   audio|video
     *    unpublished               string          hide|show|only
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'album/published/'+year+'/',
      data: $.param(options)
    });

  };

    /** Get all albums in a year **/
  factory.albumTracksRecordedYear = function(year, options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    size                      Integer         \d+
     *    from                      Integer         \d+
     *    content-type              Array(string)   song|speech|audiobook|singsong|video
     *    media-type                Array(string)   audio|video
     *    unpublished               string          hide|show|only
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'album/tracks_recorded/'+year+'/',
      data: $.param(options)
    });

  };

  /** Get a translated version of an album **/
  factory.albumGet = function(id, options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    raw                       Boolean         Role: ROLE_ALBUM_MANAGER
     */

    /** RETURNS
     *    id                        Integer
     *    parent_id                 Integer
     *    type                      String
     *    description               String
     *    created_at                datetime        ISO 8601
     *    ended_at                  datetime        ISO 8601
     *    started_at                datetime        ISO 8601
     *    original_languages        String          ISO 639-1 || ISO 639-3
     *    translations [{           Array(objects)
     *      language: '',           string          ISO 639-1 || ISO 639-3
     *      title: ''               String
     *    }]
     *    show_in_listing *         Boolean
     *    show_in_library *         Boolean
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'album/'+id,
      data: $.param(options)
    });
  };

  /** Save an album **/
  factory.albumPut = function(id, options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    parent_id *               Integer         Can also be NULL
     *    started_at *              datetime        ISO 8601
     *    ended_at *                datetime        ISO 8601
     *    original_language *       String          ISO 639-1 || ISO 639-3
     *    translations [{           Array(objects)
     *      language: '',           string          ISO 639-1 || ISO 639-3
     *      title: ''               String
     *    }]
     *    cover *                   String
     *    show_in_listing *         Boolean
     *    show_in_library *         Boolean
     *    type                      String          Always 'album'
     *    description               String
     */

    return factory.addToQueue({
      method: 'PUT',
      url: serverUrl+'album/'+id,
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Delete an album **/
  factory.albumDelete = function(id) {

    return factory.addToQueue({
      method: 'DELETE',
      url: serverUrl+'album/'+id
    });

  };

  /** Get a list of years with albums for the archive (published sorting) **/
  factory.facetsAlbumPublishedYears = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    content-type              Array(String)   song|speech|audiobook|singsong|video
     *    media-type                Array(String)   audio|video
     *    unpublished               String          hide|show|only
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'facets/album_published/years',
      data: $.param(options)
    });

  };

  /** Get a list of years with tracks for the archive (recorded sorting) **/
  factory.facetsTrackRecordedYears = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    content-type              Array(String)   song|speech|audiobook|singsong|video
     *    media-type                Array(String)   audio|video
     *    unpublished               String          hide|show|only
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'facets/track_recorded/years',
      data: $.param(options)
    });

  };

  /** Authenticates the user by redirecting him to the Sherwood SignOn Server **/
  factory.loginRedirect = function(options) {

    var loginUrl = serverUrl+'login/redirect?redirect_to='+window.location;
    var iframe = '<iframe style="width: 0; height: 0; visibility: hidden;"'+
                 'id="login" src="'+loginUrl+'"></iframe>',
        loaded = false;

    $('body').append(iframe);

    //Login success
    $('#login').load(function () {
      loaded = true;
      if (typeof options !=='undefined') {
        options.done();
      }
    });

    //Login failed
    $timeout(function() {
      if (!loaded) {
        if (typeof options !=='undefined') {
          options.fail(loginUrl);
        } else {
          window.location = loginUrl;
        }
      }
    }, 3000);

  };

  /** Get a list of the data **/
  factory.search = function(term, options) {
    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    size                      Integer         \d+ Def = 20
     *    from                      Integer         \d+ Def = 0
     *    resource-type             Array(String)   album|track
     *    media-type                Array(String)   audio|video
     *    content-type              Array(String)   song|speech|audiobook|singsong|video
     *    unpublished               String          hide|show|only Role: ROLE_CONTENT_UNPUBLISHED
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'search/'+term,
      data: $.param(options)
    });
  };

  factory.searchV2 = function(term, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'search/v2/'+term,
      data: $.param(options)
    });
  };

  /** Logout cookie session **/
  factory.logout = function() {

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'logout',
      dataType: 'text'
    });

  };

  /** Get a list of suggestions based on a given term **/
  factory.suggest = function(term) {

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'suggest/'+term
    });

  };

  /** Save a new track **/
  factory.trackPost = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'track/',
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Get a list of the latest tracks in the library **/
  factory.trackLatest = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    size                      Integer         \d+ Def = 20
     *    from                      Integer         \d+ Def = 0
     *    content-type              Array(String)   song|speech|audiobook|singsong|video
     *    media-type                Array(String)   audio|video
     *    unpublished               String          hide|show|only Role: ROLE_CONTENT_UNPUBLISHED
     *    tags                      Array(String)
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'track/',
      data: $.param(options)
    });

  };

  /** Get a list of tracks related to what you asked for **/
  factory.trackRel = function(key, options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    size                      Integer         \d+ Def = 20
     *    from                      Integer         \d+ Def = 0
     *    content-type              Array(String)   song|speech|audiobook|singsong|video
     *    media-type                Array(String)   audio|video
     *    unpublished               String          hide|show|only Role: ROLE_CONTENT_UNPUBLISHED
     */

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'track/rel/'+key+'/',
      data: $.param(options)
    });

  };

  /** Get a translated version of a track **/
  factory.trackGet = function(id, options, languages) {

    if (typeof options === 'undefined') { options = {}; }

    /** RETURNS
     *    Absolute file path
     */

    var headers = {};
    if (typeof languages !== 'undefined') {
      headers['Accept-Language'] = languages;
    }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'track/'+id,
      data: $.param(options),
      headers: headers
    });

  };

  /** Save a new track to existing album **/
  factory.trackPut = function(id, options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'PUT',

      url: serverUrl+'track/'+id,
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Delete a track **/
  factory.trackDelete = function(id) {

    return factory.addToQueue({
      method: 'DELETE',
      url: serverUrl+'track/'+id
    });

  };

  /** Add a file to a track **/
  factory.trackFiles = function(id, type, file) {

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'track/'+id+'/files/',
      file: file,
      data: JSON.stringify({
        type: type
      }),
      contentType: 'application/json'
    });

  };


  factory.loadNewlyCreatedUser =

  /** Get the users profile **/
  factory.loginUser = function() {
    var deferred = $q.defer();

    var searchObject = $location.search();
    if (searchObject.access_token) {
      console.log("basic auth detected");

      console.log("bypass login and use provided basic auth token");

      oidcUser = {
        access_token: searchObject.access_token,
        profile: {
          "https://members.bcc.no/app_metadata": {
            person_id: 1
          }
        }
      };

      factory.sendXHR({
        method: 'GET',
        url: serverUrl+'currentUser'
      }, false).then(function(apiUser) {
        deferred.resolve(apiUser);
      });
      return deferred.promise;
    }


    ngOidcClient.manager.events.addUserLoaded(function(user) {
      // Update user when silent renew is triggered
      oidcUser = user;
      window.localStorage.setItem('oidc', window.JSON.stringify(oidcUser));
    });

    ngOidcClient.manager.getUser().then(function(user){
      if (!user) {
        console.log("signinRedirect");
        ngOidcClient.manager.signinRedirect({state:window.location.href});
      } else {
        oidcUser = user;
        window.localStorage.setItem('oidc', window.JSON.stringify(oidcUser));

        var loadNewlyCreatedUser = function(triesSoFar, promise) {
          factory.sendXHR({
            method: 'GET',
            url: serverUrl+'currentUser'
          }, false).then(function(apiUser) {
            console.log("needed "+(triesSoFar+1)+" tries to load the user");
            promise.resolve(apiUser);
          }, function() {
            if (triesSoFar > 10) {
              alert("An unexpected error occurred. Please contact support");
            } else {
              loadNewlyCreatedUser(triesSoFar+1, promise);
            }
          });
        }

        factory.sendXHR({
          method: 'GET',
          url: serverUrl+'currentUser'
        }, false).then(function(apiUser) {
          deferred.resolve(apiUser);
        }, function(xhr) {
          if (xhr.status == 417) {
            console.log("We need to create the user");
            factory.sendXHR({
              method: 'PUT',
              url: serverUrl+'currentUser'
            }).then(function() {
              loadNewlyCreatedUser(0, deferred);
            });
          }
        });
        //Errors are handeled by the initializator, therefore no errorHandler, (second argument false)
      }
    });

    return deferred.promise;
  };

  /** Accept track guessed for file, when file is uploaded through FTP **/
  factory.fileUploadedGuessTracksGet = function() {

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'file/uploaded/guess_tracks'
    });

  };

  /** Accept track guessed for file, when file is uploaded through FTP **/
  factory.fileUploadedNameLink = function(link, id, lang) {

    if (typeof lang === 'undefined') { return false; }
    return factory.addToQueue({
      method: 'POST',
      headers: {
        'Link': '</track/'+id+'>',
        'Accept-Language': lang,
        'X-HTTP-METHOD-OVERRIDE': 'LINK'
      },
      url: serverUrl+'file/uploaded/'+link
    });

  };

  /** Get a list of registered users (admins) **/
  factory.userGet = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'user/',
      data: $.param(options)
    });

  };

  /** Contributor autocompletion search **/
  factory.userSuggesterCompletionGet = function(term, options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'user/suggester/completion/'+term,
      data: $.param(options)
    });

  };

  /** Get a user profile **/
  factory.userUsernameGet = function(username) {

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'user/'+encodeURIComponent(username)
    });

  };

  /** Update / create a user profile **/
  factory.userUsernamePut = function(username, options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'PUT',
      url: serverUrl+'user/'+encodeURIComponent(username),
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Delete a user profile **/
  factory.userUsernameDelete = function(username) {

    return factory.addToQueue({
      method: 'DELETE',
      url: serverUrl+'user/'+encodeURIComponent(username)
    });

  };

  /** Add a track, and PUT it again **/
  factory.userTrackCollectionPost = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'track_collection/',
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Add a track, and PUT it again **/
  factory.userTrackCollectionLink = function(playlist, tracks, language) {

    if (typeof tracks === 'undefined') { tracks = {}; }

    /** headers
     *    'Accept-Language':        String          ISO 639-1 || ISO 639-3
     *    'Link':                   <url1> <- Currently not working with multiple
     *    'Link':                   <url2> <- last will be used
     */

    return factory.addToQueue({
      method: 'POST',
      headers: {
        'Accept-Language': language,
        'X-HTTP-METHOD-OVERRIDE': 'LINK'
      },
      url: serverUrl+'track_collection/'+playlist,
      beforeSend: function (xhr) {
        var links = '';
        $.each(tracks, function() {
          links+='</track/'+this+'>,';
        });
        xhr.setRequestHeader('Link', links);
      }
    });

  };

  factory.userTrackCollectionsGet = function() {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'track_collection/'
    });
  };

  /** Get a collection **/
  factory.userTrackCollectionGet = function(id) {

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'track_collection/'+id
    });

  };

  /** Add to collection **/
  factory.userTrackCollectionPut = function(id, options) {

    if (typeof options === 'undefined') { options = {}; }

    /** OPTIONS (Stars = Required)
     *    type                      String          Always 'track_collection'
     *    track_references [{ *
     *      id: int, *              Integer
     *      language: '', *         String          ISO 639-1 || ISO 639-3
     *    }]
     */

    options.type = 'track_collection';

    return factory.addToQueue({
      method: 'PUT',
      url: serverUrl+'track_collection/'+id,
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Delete a collection **/
  factory.userTrackCollectionDelete = function(id) {

    return factory.addToQueue({
      method: 'DELETE',
      url: serverUrl+'track_collection/'+id
    });

  };

  /** Insert a contributor **/
  factory.contributorPost = function(options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'contributor/',
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Get a contributor **/
  factory.contributorIdGet = function(id, options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'contributor/'+id,
      data: $.param(options)
    });

  };

  factory.contributorSearchGet = function(term, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'contributor/search/'+term,
      data: $.param(options)
    });
  };

  factory.contributorSearchUnpublishedGet = function(term, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'contributor/search_unpublished/'+term,
      data: $.param(options)
    });
  };

  /** Update a contributor **/
  factory.contributorIdPut = function(id, options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'PUT',
      url: serverUrl+'contributor/'+id,
      data: JSON.stringify(options),
      contentType: 'application/json'
    });

  };

  /** Delete a contributor **/
  factory.contributorIdDelete = function(id) {

    return factory.addToQueue({
      method: 'DELETE',
      url: serverUrl+'contributor/'+id
    });

  };

  /** Get a list of tracks from contributor **/
  factory.contributorTracksGet = function(id, options) {

    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'contributor/'+id+'/track/',
      data: $.param(options)
    });

  };

  /** Move a language within a track **/
  factory.changeTrackLanguagePost = function(id, fromLanguage, toLanguage) {

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'track/'+id+'/'+fromLanguage+'/changeTo/'+toLanguage
    });
  };

  factory.sendNotification = function(notification) {
    return factory.addToQueue({
      method: 'POST',
      url: serverUrl + 'notifications/send',
      data: JSON.stringify(notification),
      contentType: 'application/json'
    });
  };

  factory.getTags = function(){
    return factory.addToQueue({
      method:'GET',
      url: serverUrl + 'tags/'
    });
  };

  factory.podcastTracksGet = function(id, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method:'GET',
      url: serverUrl + 'podcast/' + id + '/track/',
      data: $.param(options)
    });
  };

  factory.playlistTracksGet = function(id, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method:'GET',
      url: serverUrl + 'playlist/' + id + '/track/',
      data: $.param(options)
    });
  };

  factory.playlistSharedGet = function(secret) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'shared_playlist/' + secret
    });
  };

  factory.playlistSharedFollow = function(secret) {
    return factory.addToQueue({
      method: 'POST',
      url: serverUrl + 'shared_playlist/' + secret + '/follow'
    })
  };

  factory.groupGoalGet = function(secret) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'groupgoal/' + secret
    })
  };
  factory.groupGoalJoin = function(secret) {
    return factory.addToQueue({
      method: 'POST',
      url: serverUrl + 'groupgoal/' + secret + '/join'
    })
  };

  factory.churchStatisticsGet = function(churchId) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'statistics/project/church/' + churchId
    })
  };

  factory.trackListOverview = function(type, options) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + type + '/overview',
      data: options ? $.param(options) : undefined
    });
  };

  factory.unpublishedTrackListGet = function(type) {
    return factory.trackListGet(type, {unpublished: 'only', raw: true});
  };

  factory.trackListGet = function(type, options) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + type + '/',
      data: options ? $.param(options) : undefined
    });
  };

  factory.podcastsGet = function(options) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'podcast/',
      data: options ? $.param(options) : undefined
    });
  };

  factory.playlistsGet = function(options) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'playlist/',
      data: options ? $.param(options) : undefined
    });
  };

  factory.trackListCreate = function(type, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl + type +'/',
      data: JSON.stringify(options),
      contentType: 'application/json'
    });
  };

  factory.trackListIdGet = function(type, id, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+type+'/'+id,
      data: $.param(options)
    });
  };

  factory.trackListUpdate = function(type, id, options) {
    if (typeof options === 'undefined') { options = {}; }

    return factory.addToQueue({
      method: 'PUT',
      url: serverUrl + type + '/' + id,
      data: JSON.stringify(options),
      contentType: 'application/json'
    });
  };

  factory.trackListDelete = function(type, id) {
    return factory.addToQueue({
      method: 'DELETE',
      url: serverUrl + type + '/' + id
    });
  };

  factory.trackListOverviewUpdate = function(type, collection) {
    return factory.addToQueue({
      method: 'PUT',
      url: serverUrl + type + '/collection/',
      data: JSON.stringify(collection),
      contentType: 'application/json'
    });
  };

  factory.nextTracksToBePublished = function() {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'notifications/next/'
    });
  };

  factory.transmissionsGet = function(options) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'transmission/'
    });
  };

  factory.transmissionIdGet = function(id, options) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'transmission/'+id
    });
  };

  factory.transmissionPost = function(transmission) {
    if (typeof transmission === 'undefined') { transmission = {}; }

    return factory.addToQueue({
      method: 'POST',
      url: serverUrl+'transmission/',
      data: JSON.stringify(transmission),
      contentType: 'application/json'
    });
  };

  factory.transmissionIdPut = function(id, transmission) {
    if (typeof transmission === 'undefined') { transmission = {}; }

    return factory.addToQueue({
      method: 'PUT',
      url: serverUrl + 'transmission/' + id,
      data: JSON.stringify(transmission),
      contentType: 'application/json'
    });
  };

  factory.transmissionIdDelete = function(id) {
    return factory.addToQueue({
      method: 'DELETE',
      url: serverUrl + 'transmission/' + id
    });
  };

  // SongTreasures
  // See https://songtreasures.azurewebsites.net/swagger for information about the api
  factory.songMetadataGet = function(songbook, id) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'songtreasures/Songs/'+songbook+'/'+id+'?expand=participants/contributor',
      beforeSend: function(xhr) {
        xhr.setRequestHeader("X-Api-Version", 3);
      }
    });
  };

  factory.songLyricsGet = function(songGuid, language){
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl+'songtreasures/Songs/'+songGuid+'/Lyrics?language='+language+'&format=json',
      beforeSend: function(xhr) {
        xhr.setRequestHeader("X-Api-Version", 3);
      }
    })
  }

  factory.getAnalytics = function(trackId) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'statistics/track/'+trackId,
    })
  };

  factory.getApkUrl = function(){
    return serverUrl + 'file/apk';
  };

  factory.getDownloadLinks = function() {
    return factory.addToQueue({
      method: "GET",
      url: serverUrl + 'download-links'
    })
  };

  factory.getLyrics = function(lyricsId) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'lyrics/'+lyricsId,
    })
  };

  factory.lyricsSearch = function(term) {
    return factory.addToQueue({
      method: 'GET',
      url: serverUrl + 'lyrics/search/'+term,
    })
  };

  factory.replaceLyrics = function(trackId) {
    return factory.addToQueue({
      method: 'POST',
      url: serverUrl + 'track/'+trackId+'/replaceLyrics/',
    })
  };

  return factory;

});
