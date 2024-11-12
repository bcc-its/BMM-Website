'use strict';

angular.module('bmmApp')
  .controller('UsersCtrl', function ($scope, $timeout, _api, _init) {

    $scope.$watch('userSearch', function(name) {
      if (name!=='') {
        _api.userSuggesterCompletionGet(name, {
          //roles: []
        }).done(function(users) {
          $scope.$apply(function() {

            $.each(users, function() {

              var perm = this.perm = {
                ROLE_ADMINISTRATOR: false,
                ROLE_ALBUM_MANAGER: false,
                ROLE_TRACK_MANAGER: false,
                ROLE_PODCAST_MANAGER: false,
                ROLE_PLAYLIST_MANAGER: false,
                ROLE_DOWNLOADER: false,
                ROLE_TRANSCRIPTION_MANAGER: false,
                ROLE_NOTIFICATION_MANAGER: false,
                ROLE_CONTRIBUTOR_MANAGER: false,
                ROLE_FEATURE_PREVIEW: false,
                ROLE_LIVE_MANAGER: false,
                ROLE_FRAKAARE_DASHBOARD: false,
                ROLE_LYRICS_MANAGER: false
              };

              $.each(this.roles, function() {
                perm[this] = true;
              });

            });

            $scope.searchResults = users;

          });
        });
      } else {
        $scope.contributors = [];
      }
    });

    $scope.updateUser = function(user, search) {

      var _roles = [];

      $.each(user.perm, function(key) {
        if (this) {
          _roles.push(key);
        }
      });

      $scope.status = _init.translation.states.savingChanges;

      if (search) {
        _api.userUsernamePut(user.id, {
          roles: _roles
        }).always(function() {
          $scope.$apply(function() {
            $timeout(function() {
              $scope.fetchUsers();
            }, 2000);
          });
        });
      } else {
        _api.userUsernamePut(user.id, {
          roles: _roles
        }).always(function() {
          $scope.status = _init.translation.states.allIsWell;
        });
      }
    };

    $scope.fetchUsers = function() {

      _api.userGet({
        size: 500
      }).done(function(users) {
        $scope.$apply(function() {

          $.each(users, function() {

            var perm = this.perm = {
              ROLE_ADMINISTRATOR: false,
              ROLE_ALBUM_MANAGER: false,
              ROLE_TRACK_MANAGER: false,
              ROLE_CONTRIBUTOR_MANAGER: false,
              ROLE_FEATURE_PREVIEW: false,
              ROLE_LIVE_MANAGER: false,
              ROLE_FRAKAARE_DASHBOARD: false,
              ROLE_LYRICS_MANAGER: false
            };

            $.each(this.roles, function() {
              perm[this] = true;
            });

          });

          $scope.users = users;
          $scope.status = _init.translation.states.allIsWell;

        });
      });
    };
    $scope.fetchUsers();

  });
