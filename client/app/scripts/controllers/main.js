'use strict';

angular.module('bmmApp')
  .controller('MainCtrl', function (
      $scope,
      $timeout,
      $location,
      $route,
      bmmApi,
      bmmPlaylist,
      bmmPlayer,
      bmmUser,
      bmmPlay,
      draggable
    ) {

    $scope.loadEnd = false;

    //Check for iphone / ipod / ipad
    var ipad = (navigator.userAgent.match(/iPad/i) !== null);
    var iphone = (navigator.userAgent.match(/iPhone/i) !== null);
    var ipod = (navigator.userAgent.match(/iPod/i) !== null);

    if (ipad||iphone||ipod) {
      $scope.ios = true;
    } else {
      $scope.ios = false;
    }

    $scope.setMediaLanguage = function(lang) {
      bmmUser.setMediaLanguage(lang);
      $scope.mediaLanguage = bmmUser.mediaLanguage;
      $route.reload();
    };

    $scope.getCurrent = function() {
      $location.path( bmmPlaylist.getUrl() );
    };

    var findMediaLanguage = function(lang, index) {
      if (typeof lang[index]==='undefined') {
        bmmUser.setMediaLanguage('nb');
      }

      if (!bmmUser.mediaLanguageIsSet()&&$.inArray(lang[index],$scope.languages)!==-1) {
        bmmUser.setMediaLanguage(lang[index]);
        $scope.mediaLanguage = bmmUser.mediaLanguage;
      } else if (!bmmUser.mediaLanguageIsSet()) {
        findMediaLanguage(lang, index+1);
      }
    };

    var findTranslation = function(lang, index) {
      if (typeof lang[index]==='undefined') {
        lang[index] = 'nb'; //Fallback
      }

      $.ajax({
        url: 'translations/'+lang[index]+'.json',
        error: function() {
          findTranslation(lang, (index+1));
        },
        success: function(data) {
          $scope.$apply(function() {
            $scope.translation = data;
            bmmUser.setTranslation(data);
          });
        }
      });
    };

    $('.bmm-view').off('scrollBottom');

    $scope.translation = {};

    bmmApi.loginUser().done(function(user) {

      $scope.trackCollections = user.track_collections;
      bmmUser.setUsername(user.username);
      bmmUser.setUser(user);
      bmmApi.setCredentials(bmmUser.getUser().username, bmmUser.getUser().token);
      console.log(bmmApi.getserverUrli());

      bmmApi.root().done(function(root) {

        //Temporary remove arabic (@todo - remove later)
        $.each(root.languages, function(index) {
          if (this==='ar') {
            root.languages.splice(index,1);
          }
        });

        $scope.$apply(function() {
          $scope.languages = root.languages; //Must set before findTrans..
          findTranslation(user.languages,0);
          findMediaLanguage(user.languages,0);
          $scope.loadEnd = true;
        });

      });

    }).fail(function() {

      bmmApi.loginRedirect();

    });

    $scope.go = function ( path ) {
      $location.path( path );
    };

    $scope.play = function(playlist, index) {
      bmmPlay.setPlay(playlist, index);
    };

    $scope.addPLaylist = function(newPlaylist) {

      bmmApi.userTrackCollectionPost({
        name: newPlaylist,
        type: 'track_collection',
        access: [bmmUser.getUsername()]
      }).always(function(xhr) {

        if (xhr.status===201) {

          $scope.$apply(function() {

            $scope.bmmPlaylistAdd = false;
            $scope.newPlaylist = '';
            $scope.trackCollections.splice(0,0, {
              id: xhr.getResponseHeader('X-Document-Id'),
              name: newPlaylist
            });

            $timeout(function() {
              $scope.$apply(function() {
                //For playlists
                $('.bmm-playlist').trigger('dragdrop');
                //Other draggables
                draggable.makeDraggable($scope);
              });
            });

          });
        } else {
          console.log('Failed...');
        }

      });

    };

    $scope.removePLaylist = function(playlist) {

      if (confirm('Are you sure you want to delete this playlist?')) {
        bmmApi.userTrackCollectionDelete(playlist).fail(function(xhr) {

          if (xhr.status<300) {

            $.each($scope.trackCollections, function(index) {

              if (this.id===playlist) {

                $scope.$apply(function() {
                  $scope.trackCollections.splice(index,1);
                });

                return false;

              }

            });

          }

        });
      }

    };

    $scope.renamePlaylist = function(_collection) {

      bmmApi.userTrackCollectionGet(_collection.id).done(function(collection) {

        var makeReferences = function(tracks) {

          var ref=[];
          $.each(tracks, function() {
            ref.push({
              id: this.id,
              language: this.language
            });
          });

          return ref;

        };

        bmmApi.userTrackCollectionPut(_collection.id, {
          name: _collection.newName,
          type: 'track_collection',
          track_references: makeReferences(collection.tracks),
          access: collection.access
        }).always(function() {

          $scope.$apply(function() {
            _collection.edit = false;
            _collection.name = _collection.newName;
            _collection.newName = '';
          });

        });

      });

    };

    $scope.exitRename = function(_collection) {
      _collection.newName = '';
      _collection.edit = false;
    };

    $(window).bind('scroll', function() {
      if($(window).scrollTop() + $(window).height()>=$(document).height()) {
        $(window).trigger('scrollBottom');
      }
    });

  });
