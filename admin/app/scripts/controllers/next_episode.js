'use strict';

angular.module('bmmApp')
  .controller('NextEpisodeCtrl', function(
    $scope,
    $routeParams,
    _api,
    _init
  ) {
  $scope.init = _init;
  $scope.differenceToleranceSeconds = 10;

  $scope.nextEpisodesIds = [];
  $scope.episodeShowedIndex = 0;

  var offset = 0;
  var maxEpisodes = 30;
  var minOldEpisodes = 5;
  var oldEpisodesIndex = 0;
  var datetime = new Date();

  var getNextEpisodesIds = function(episodes) {
    // Info: Episodes are ordered newest first
    var newestPublishedId = 0;
    episodes.forEach(function(episode) {
      offset++;
      $scope.nextEpisodesIds.unshift(episode.id);

      if ($scope.nextEpisodesIds.length > maxEpisodes) {
        $scope.nextEpisodesIds.pop();
      }

      if (new Date(episode.published_at) < datetime) {
        if (newestPublishedId === 0){
          newestPublishedId = episode.id;
        }

        oldEpisodesIndex++;
      }
    });

    if (newestPublishedId !== 0) {
      $scope.episodeShowedIndex = $scope.nextEpisodesIds.indexOf(newestPublishedId);
      if ($scope.episodeShowedIndex < $scope.nextEpisodesIds.length-1) {
        $scope.episodeShowedIndex++;
      }
    } else {
      $scope.episodeShowedIndex = 0;
    }

    if (oldEpisodesIndex < minOldEpisodes && episodes.length == maxEpisodes) {
      // In case all the episodes are unpublished episodes we load the next 30 episodes
      var preserveIndex = $scope.episodeShowedIndex;
      init(offset);
      if (preserveIndex !== 0)
        $scope.episodeShowedIndex = preserveIndex;
    }
  };

  var orderLanguages = function() {
    var languageOrdering = ['nb', 'en', 'de', 'nl', 'ro', 'hu', 'pl', 'fr', 'ru', 'es', 'fi', 'pt', 'tr', 'it', 'ta', 'sl'];
    var orderedLanguages = [];

    for (var i = 0; i < languageOrdering.length; i++) {
      for (var j = 0; j < $scope.nextEpisode.translations.length; j++) {
        if ($scope.nextEpisode.translations[j].language == languageOrdering[i]) {
          orderedLanguages.push($scope.nextEpisode.translations[j]);
          $scope.nextEpisode.translations.splice(j, 1);
          break;
        }
      }
    }

    $scope.nextEpisode.translations = orderedLanguages.concat($scope.nextEpisode.translations);
  }

  var detectDuplicateTitles = function(){
    for (var i = 0; i < $scope.nextEpisode.translations.length; i++) {
      for (var j = i+1; j < $scope.nextEpisode.translations.length; j++) {
        if ($scope.nextEpisode.translations[i].title == $scope.nextEpisode.translations[j].title) {
          $scope.nextEpisode.translations[i].duplicate_title = $scope.nextEpisode.translations[j].duplicate_title = true;
        }
      }
    }
  }

  var detectBigDifferenceInDuration = function(){
    var originalLanguageDuration = 0;

    $scope.nextEpisode.translations.forEach(function(translation) {
      if (translation.language == $scope.nextEpisode.original_language && translation.media != null && translation.media[0]) {
        originalLanguageDuration = translation.media[0].files[0].duration;
        return;
      }
    });

    $scope.nextEpisode.translations.forEach(function(translation) {
      if (translation.media != null && translation.media.length > 0)
        if (Math.abs(translation.media[0].files[0].duration - originalLanguageDuration) >= $scope.differenceToleranceSeconds) {
          translation.big_difference_in_duration = true;
        }
    });
  }

  var detectDuplicateFilesize = function() {
    for (var i = 0; i < $scope.nextEpisode.translations.length; i++) {
      for (var j = i+1; j < $scope.nextEpisode.translations.length; j++) {
        var iT = $scope.nextEpisode.translations[i];
        var jT = $scope.nextEpisode.translations[j];
        if (iT.media != null && iT.media.length > 0 && jT.media != null && jT.media.length > 0
          && iT.media[0].files[0].size == jT.media[0].files[0].size){
          iT.duplicate_filesize = true;
          iT.duplicate_filesize_language = jT.language;
          jT.duplicate_filesize = true;
          jT.duplicate_filesize_language = iT.language;
        }
      }
    }
  }

  var detectMissingLanguages = function(){
    var expectedLanguages = ['nb', 'en', 'de', 'nl', 'ro', 'hu', 'pl', 'fr', 'ru'];
    var availableLanguages = $scope.nextEpisode.translations.map(function(translation) { return translation.language; });

    expectedLanguages.forEach(function(expectedLang) {
      if (availableLanguages.indexOf(expectedLang) === -1) {
        $scope.missingLanguages.push(expectedLang);
      }
    });
  }

  function doneLoading() {
    $scope.loading = false;
  }

  $scope.getPreviousEpisode = function() {
    $scope.episodeShowedIndex--;
    getEpisodeInformation();
  }

  $scope.getNextEpisode = function() {
    $scope.episodeShowedIndex++;
    getEpisodeInformation();
  }

  function getEpisodeInformation() {
    $scope.loading = true;
    $scope.missingLanguages = [];

    if ($scope.nextEpisodesIds[$scope.episodeShowedIndex]) {
      _api.trackGet($scope.nextEpisodesIds[$scope.episodeShowedIndex], {raw: true}).then(function(nextEpisode) {
        $scope.nextEpisode = nextEpisode;

        orderLanguages();
        detectDuplicateTitles();
        detectBigDifferenceInDuration();
        detectDuplicateFilesize();
        detectMissingLanguages();

        $scope.nextEpisode.published = new Date(nextEpisode.published_at) < datetime;
        $scope.norwegianNotMainLanguage = nextEpisode.original_language != 'nb' ? true : false;

        $scope.songbookIsNotSet = true;
        $scope.lyricistIsMissing = true;
        $scope.composerIsMissing = true;
        $scope.noUpcomingEpisode = false;
        $scope.wrongTrackType = nextEpisode.subtype !== "audiobook";
        if ($scope.episodeShowedIndex === $scope.nextEpisodesIds.length - 1 && $scope.nextEpisode.published) {
          $scope.noUpcomingEpisode = true;
        }
        nextEpisode.rel.forEach(function(item){
          if (item.type == "songbook")
            $scope.songbookIsNotSet = false;
          else if (item.type == "lyricist")
            $scope.lyricistIsMissing = false;
          else if (item.type == "composer")
            $scope.composerIsMissing = false;
        });

        $scope.errors = $scope.missingLanguages.length > 0 || $scope.norwegianNotMainLanguage || $scope.lyricistIsMissing
          || $scope.composerIsMissing || $scope.noUpcomingEpisode || $scope.wrongTrackType;

      }).then(function(){
        doneLoading();
      });
    } else {
      doneLoading();
    }
  }

  function init(offset) {
    $scope.loading = true;

    _api.trackListIdGet("podcast", $routeParams.id).then(function(podcast) {
      $scope.podcast = podcast;

      _api.podcastTracksGet($routeParams.id, {size: maxEpisodes, from: offset, unpublished: 'show'}).then(function(episodes) {
        if (episodes.length > 0) {
          getNextEpisodesIds(episodes);
          getEpisodeInformation();
        }
      });
    }).fail(function() {
      doneLoading();
    });
  };

  $scope.postScreenshot = function() {
    _api.podcastScreenshot($routeParams.id);
  }

  init(offset);
});
