'use strict';

angular.module('bmmApp')
  .controller('TrackCtrl', function (
    $scope,
    $filter,
    $location,
    $routeParams,
    $timeout,
    _waitings,
    _play,
    _api,
    _session,
    _init,
    _track,
    _album,
    _quickMenu
    ) {

    var modelLoaded=false, newTrack=false;

    if ($routeParams.id==='new') {
      newTrack = true;
    }

    $scope.model = {}; //Raw
    $scope.standardModel = {}; //Standard
    $scope.possibleSubtypes = [
      'song',
      'speech',
      'audiobook',
      'singsong',
      'exegesis',
      'video'
    ];
    $scope.replaceLyrics = false;

    // We have these default values hardcoded for the website as well for a nice UX
    // When these have to be changed, API-PHP should be changed as well
    var defaultPublisher = 'Brunstad Christian Church';
    var defaultCopyright = 'Copyright © Stiftelsen Skjulte Skatters Forlag. All Rights Reserved.';

    $scope.podcastTags = [];

    $scope.fetchModel = function(_raw) {
      if (!newTrack) {
        if (typeof _raw==='undefined'||_raw) {
          return _api.trackGet($routeParams.id, { raw: true });
        } else {
          return _api.trackGet($routeParams.id, {
            unpublished: 'show'
          });
        }
      } else {

        if (typeof $routeParams.order==='undefined') {
          $routeParams.order = 1;
        }

        if (typeof $routeParams.language==='undefined') {
          $routeParams.language = _session.current.contentLanguages[0];
        }

        if (typeof $routeParams.date==='undefined') {
          $routeParams.date = new Date();
        }

        var languages = [];
        if (typeof $routeParams.languages==='undefined') {
          languages = [{
            language: $routeParams.language,
            title: '',
            is_visible: false,
            media: [],
            publisher: '',
            copyright: ''
          }];
        } else {
          $.each($routeParams.languages.split(','), function() {
            languages.push({
              language: this,
              title: '',
              is_visible: false,
              media: [],
              publisher: '',
              copyright: ''
            });
          });
        }

        $scope.model = {
          parent_id: $routeParams.parentId,
          order: parseInt($routeParams.order),
          type: 'track',
          subtype: 'song',
          recorded_at: $routeParams.date,
          published_at: new Date(),
          original_language: $routeParams.language,
          is_visible: true,
          translations: languages,
          tags: [],
          cover: null,
          cover_upload: null,
          rel: [],
          analytics: false,
          analyticsData: {},
          lyricsData: {}
        };
        return;
      }
    };

    var findAvailableTranslations = function() {
      $scope.availableLanguages = [];
      _api.root().done(function(root) {
        $scope.$apply(function() {
          $.each(root.languages, function() {
            var available = this, found=false;
            $.each($scope.model.translations, function() {
              if (this.language===available) {
                found = true;
              }
            });
            if (!found) {
              $scope.availableLanguages.push(available);
            }
          });
          if (typeof $scope.edited==='undefined') {
            $scope.switchLanguage($scope.model.original_language);
          } else {
            $scope.switchLanguage($scope.edited.language);
          }
        });
      });
    };

    $scope.refreshModel = function() {
      var promise;
      try {
        promise = $scope.fetchModel().done(function(model) {
          $scope.$apply(function() {
            $scope.model = model;
            findAvailableTranslations();
            $scope.getLyrics();

            _api.getTags().then(function(tags) {
              $scope.podcastTags = tags;
            });
          });
          modelLoaded = true;
          $scope.status = _init.translation.states.noChanges;
        });
        $scope.fetchModel(false).done(function(model) {
          $scope.$apply(function() {
            $scope.standardModel = model;
            $scope.formattedModel = _track.resolve(model);
            _quickMenu.setMenu($scope.standardModel._meta.root_parent.published_at.substring(0,4),
                      $scope.standardModel._meta.root_parent.id,
                      $scope.standardModel.parent_id);
          });
        });
      }
      catch(err) {
        //Model is not yet created, fires when routeParams.id === 'new'
        $timeout(function() {
          findAvailableTranslations();
        });
      }
      return promise;
    };
    $scope.refreshModel();

    $scope.getAnalytics = function() {
      _api.getAnalytics($routeParams.id)
        .done(function(response) {
          $scope.model.analyticsData = response;
        });
    };

    $scope.getLyrics = function() {
      if ($scope.model.lyrics_id) {
        _api.getLyrics($scope.model.lyrics_id)
          .done(function (response) {
            $scope.lyricsData = response;
          });
      }
      else
        $scope.lyricsData = {};
    };

    $scope.getAnalytics();

    var saveModel = function() {

      //Delete parts that's unexpected by the API
      var toApi = angular.copy($scope.model);
      delete toApi._meta;
      delete toApi.id;

      $.each(toApi.translations, function() {
        delete this._meta;
      });

      if (newTrack) {
        return _api.trackPost(toApi).done(function(data, st, xhr, config) {
          if (xhr.status===201) {
            $location.path('/track/'+xhr.getResponseHeader('X-Document-Id'));
          } else {
            $scope.status = _init.translation.states.couldNotCreateTrack+', '+
                            _init.translation.states.errorCode+': '+xhr.status;
          }
        });
      } else {
        return _api.trackPut($routeParams.id, toApi);
      }
    };

    $scope.play = function(file, type) {

      var track = _track.resolve($scope.standardModel);

      track.audio = false;
      track.video = false;
      track[type] = true;

      track[(type+'s')] = [{
        file: $filter('_protectedURL')(file.path),
        type: file.mime_type,
        duration: file.duration,
        name: file.mime_type
      }];

      track.language = $scope.edited.language;
      track.title = $scope.edited.title;

      _play.setPlay([track], 0);

    };

    $scope.download = function(path) {
      window.location = $filter('_protectedURL')(path)+'?download=true';
    };

    $scope.playLinked = function(track) {
      _play.setPlay([track], 0);
    };

    var getWaitings = function() {
      _api.fileUploadedGuessTracksGet().done(function(waitings) {

        waitings = _waitings.resolve(waitings);

        $scope.$apply(function() {

          $scope.waitings = [];
          $.each(waitings.ready, function() {

            $.each(this.tracks, function() {

              $.each(this.files, function() {

                //When track with connection to current track is found
                if (this.track.id===$scope.model.id) {
                  $scope.waitings.push(this.track);
                }

              });

            });

          });

        });

      });
    };

    $scope.save = function(options) {
      $scope.status = _init.translation.states.attemptToSave;

      if(newTrack){
        saveModel(); //After saving the model we redirect to the newly created track so there is no need to fetchModel
      } else {
        saveModel().done(function() {

          if ($scope.replaceLyrics)
            _api.replaceLyrics($scope.model.id);

          $scope.status = _init.translation.states.saveSucceedFetchingNewData;
          $scope.$apply();
          $scope.fetchModel().done(function(model) {
            getWaitings();
            $scope.$apply(function() { //Model-watcher updates status to changed
              $scope.model = model;

              if ($scope.lyricsData.id !== $scope.model.lyrics_id) {
                $scope.getLyrics();
              }
              findAvailableTranslations();
              $timeout(function() { //Secure that watcher is fired
                $scope.status = _init.translation.states.saved; //Update status
                $scope.$apply(); //Render status
              });

              $scope.status = _init.translation.states.saved;
              if (typeof options!=='undefined'&&typeof options.done!=='undefined') {
                options.done();
              }
              _quickMenu.refresh();
            });
          }).fail(function() {
            $scope.status = _init.translation.states.couldNotFetchData;
            $scope.$apply();
          });
          $scope.fetchModel(false).done(function(model) {
            $scope.$apply(function() {
              $scope.standardModel = model;
              _quickMenu.setMenu($scope.standardModel._meta.root_parent.published_at.substring(0,4),
                $scope.standardModel._meta.root_parent.id,
                $scope.standardModel.parent_id);
            });
          });
        }).fail(function() {
          $scope.status = _init.translation.states.couldNotSave;
          $scope.$apply();
        });
      }
    };

    $scope.delete = function() {
      if (typeof $scope.model.id!=='undefined') {
        if (confirm(_init.translation.warnings.confirmTrackDeletion)) {
          _api.trackDelete($scope.model.id).always(function() {
            $scope.$apply(function() {
              alert(_init.translation.states.trackDeleted);
              _quickMenu.refresh();
              $location.path( '/' );
            });
          });
        }
      }
    };

    $scope.deleteFile = function(media, parentIndex, index) {
      $scope.deleteFromArray(media[parentIndex].files, index);
      if (media[parentIndex].files.length<1) {
        media.splice(parentIndex, 1);
      }
    };

    $scope.deleteFromArray = function(array, index) {
      $.each(array, function() {
        array.splice(index,1);
      });
    };

    $scope.addLanguage = function(lang) {
      $scope.model.translations.push({
        is_visible: false,
        language: lang,
        title: '',
        media: [],
        publisher: '',
        copyright: ''
      });
      $.each($scope.availableLanguages, function(index) {
        if (this === lang) {
          $scope.availableLanguages.splice(index,1);
          return false;
        }
      });
    };

    $scope.removeLanguage = function(lang) {
      if ($scope.edited.language===lang) {
        $scope.switchLanguage($scope.model.original_language);
      }
      $.each($scope.model.translations, function(index) {
        if (this.language === lang) {
          if (((typeof this.title!=='undefined'&&this.title.length>0)||
            (typeof this.media!=='undefined'&&this.media.length>0))&&
            !confirm(_init.translation.warnings.confirmTranslatedDeletion)) {
            return false;
          }
          $scope.model.translations.splice(index,1);
          $scope.availableLanguages.push(lang);
          return false;
        }
      });
    };

    $scope.switchLanguage = function(newLang, oldLang) {
      if (typeof oldLang!=='undefined') {
        $.each($scope.model.translations, function(index) {
          if (this.language===oldLang) {
            $scope.model.translations[index] = $scope.edited;
            return false;
          }
        });
      }
      $.each($scope.model.translations, function() {
        if (this.language===newLang) {
          $scope.edited = this;
          return false;
        }
      });
    };

    $scope.$watch('model', function(model) {
      if (modelLoaded) {
        $scope.status = _init.translation.states.changesPerformed;
      }

      if (typeof model.parent_id!=='undefined'&&model.parent_id!==null) {
        _api.albumGet(model.parent_id, {
          unpublished: 'show'
        }).done(function(album) {
          $scope.$apply(function() {

            if (album.parent_id!==null) {

              $scope.findParentSubAlbums(album.parent_id, album.id);
              _api.albumGet(album.parent_id, {
                unpublished: 'show'
              }).done(function(album) {
                $scope.albumParentYear = parseInt(album.published_at.substring(0,4),10);
                if (typeof $scope.parentAlbums==='undefined'||$scope.parentAlbums.length<=0) {
                  $scope.findParentAlbums($scope.albumParentYear, album);
                }
              });

            } else {
              $scope.albumParentYear = parseInt(album.published_at.substring(0,4),10);
              if (typeof $scope.parentAlbums==='undefined'||$scope.parentAlbums.length<=0) {
                $scope.findParentAlbums($scope.albumParentYear, album);
              }
            }

          });
        });
      }
    }, true);

    $scope.$watch('model.original_language', function(lang) {
      if (typeof $scope.model.translations!=='undefined') {
        $.each($scope.model.translations, function() {
          if (this.language===lang) {
            if(typeof $scope.originalLanguage!=='undefined'){
              // take the values of the previous originalLanguage
              if(this.publisher == '') {
                this.publisher = $scope.originalLanguage.publisher;
              }
              if(this.copyright == '') {
                this.copyright = $scope.originalLanguage.copyright;
              }

              $.each($scope.model.translations, function() {
                // remove the values of the previous originalLanguage
                if(this.language===$scope.originalLanguage.language){
                  this.publisher = "";
                  this.copyright = "";
                }
              });
            }
            $scope.originalLanguage = this;

            if($scope.originalLanguage.publisher == '') {
              $scope.originalLanguage.publisher = defaultPublisher;
            }

            if($scope.originalLanguage.copyright == '') {
              $scope.originalLanguage.copyright = defaultCopyright;
            }

            return false;
          }
        });
      }
    });

    $scope.addTag = function(tag) {
      $scope.model.tags.push(tag);
    };

    $scope.removeTag = function(tag) {
      var tags = $scope.model.tags;
      var index = tags.indexOf(tag);

      if(index > -1) {
        tags.splice(index, 1);
      }
    };

    $scope.uploadCover = {
      url: _api.getserverUrli()+'track/'+$routeParams.id+'/cover',
      method: 'PUT'
    };

    $scope.uploadMedia = {
      url: _api.getserverUrli()+'track/'+$routeParams.id+'/files/',
      method: 'POST'
    };

    //FETCH ALBUMS
    $scope.parentAlbums = [];
    $scope.findParentAlbums = function(year, _album_) {
      _api.albumPublishedYear(year, {
        unpublished: 'show'
      }).done(function(albums) {

        $scope.$apply(function() {
          $.each(albums, function() {
            var album = _album.resolve(this);
            $scope.parentAlbums.push(album);
          });
          $scope.parentAlbums.reverse();
          if (typeof _album_!=='undefined') {
            $.each($scope.parentAlbums, function(index) {
              if (this.id===_album_.id) {
                $scope.parentAlbum = $scope.parentAlbums[index];
                $scope.parentAlbumCurrent = this.title;
                return false;
              }
            });
          }
        });

      });
    };

    $scope.parentSubAlbums = [];
    $scope.findParentSubAlbums = function(id, sub_id) {
      _api.albumGet(id, {
        unpublished: 'show'
      }).done(function(data) {

        $scope.$apply(function() {
          $.each(data.children, function() {
            if (this.type==='album') {
              var album = _album.resolve(this);
              $scope.parentSubAlbums.push(album);
            }
          });
          $scope.parentSubAlbums.reverse();
          if (typeof sub_id!=='undefined') {
            $.each($scope.parentSubAlbums, function(index) {
              if (this.id===sub_id) {
                $scope.parentSubAlbum = $scope.parentSubAlbums[index];
                $scope.parentAlbumCurrent = this.title;
                return false;
              }
            });
          }
        });

      });
    };

    $scope.exceptActiveTags = function(tag) {
      if(!$scope.model || !$scope.model.tags) {
        return false;
      }

      var activeTags = $scope.model.tags;
      var isActive = activeTags.indexOf(tag) !== -1;
      return !isActive;
    }

    $scope.selectParentAlbum = function(album) {
      $scope.model.parent_id = album.id;
      $scope.parentAlbumCurrent = album.title;
    };

    getWaitings();

    $scope.linkWaiting = function(link, id, lang, index) {
      $scope.status = _init.translation.states.attemptToSave;
      _api.fileUploadedNameLink(link.file, id, lang).done(function() {
        $scope.waitings.splice(index, 1);
        $scope.refreshModel();
        $scope.status = _init.translation.states.noChanges;
      });
    };

    /* Changes the language of the media file, not the selected language */
    $scope.changeLanguage = function(toLanguage) {
      if(toLanguage){
        saveModel().then(function() {
          return _api.changeTrackLanguagePost($scope.model.id, $scope.edited.language, toLanguage);
        }).then(function() {
          return $scope.refreshModel();
        }).then(function() {
          $timeout(function() {
            $scope.switchLanguage(toLanguage);
          }, 0);
        });
      }
    };

  });
